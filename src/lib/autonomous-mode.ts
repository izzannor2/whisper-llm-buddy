// Autonomous Mode — reliable multi-step AI execution with plan→execute→evaluate→repeat loop

import { sendChatMessage, loadSettings, ChatMessage, ChatSettings } from './chat-api';
import { routeToAgent } from './agent-router';
import { getRelevantMemories } from './memory-store';
import { createTask, updateTaskStatus, addTaskLog } from './orchestrator';
import { recordToolUse, getToolLearningHints } from './tool-learning';
import { checkPermission, logAuditEntry } from './permissions';

// ===== Types =====

export interface AutonomousConfig {
  maxSteps: number;
  confirmDestructive: boolean;
  enabled: boolean;
}

interface StepResult {
  response: string;
  status: 'continue' | 'complete' | 'blocked' | 'failed';
  reason?: string;
}

// ===== State =====

let autonomousState = {
  active: false,
  currentGoal: '',
  stepCount: 0,
  maxSteps: 20,
  shouldStop: false,
  currentPhase: '' as '' | 'planning' | 'executing' | 'evaluating' | 'recovering',
  lastError: '',
  retryCount: 0,
};

let stateListeners: Array<(state: typeof autonomousState) => void> = [];
let pendingConfirmation: {
  resolve: (confirmed: boolean) => void;
  action: string;
} | null = null;

export function getAutonomousState() { return { ...autonomousState }; }

export function subscribeAutonomous(listener: (state: typeof autonomousState) => void): () => void {
  stateListeners.push(listener);
  return () => { stateListeners = stateListeners.filter(l => l !== listener); };
}

function notifyState() { stateListeners.forEach(l => l({ ...autonomousState })); }

export function stopAutonomous(): void {
  autonomousState.shouldStop = true;
  autonomousState.active = false;
  // Reject any pending confirmation
  if (pendingConfirmation) {
    pendingConfirmation.resolve(false);
    pendingConfirmation = null;
  }
  notifyState();
}

/** Called by UI when user confirms or rejects a risky action */
export function resolveConfirmation(confirmed: boolean): void {
  if (pendingConfirmation) {
    pendingConfirmation.resolve(confirmed);
    pendingConfirmation = null;
  }
}

/** Check if there's a pending confirmation request */
export function getPendingConfirmation(): string | null {
  return pendingConfirmation?.action || null;
}

// ===== Context Builder =====

function buildFullContext(
  goal: string,
  stepNumber: number,
  recentActions: string[],
  memoryContext: string,
  toolHints: string,
  phase: string,
  lastError: string,
): string {
  const sections: string[] = [];

  sections.push(`## Current Goal\n${goal}`);
  sections.push(`## Execution Phase: ${phase.toUpperCase()} (Step ${stepNumber})`);

  if (memoryContext) sections.push(memoryContext);
  if (toolHints) sections.push(toolHints);

  if (recentActions.length > 0) {
    sections.push(`## Recent Actions (last ${recentActions.length})\n${recentActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`);
  }

  if (lastError) {
    sections.push(`## Last Error\n${lastError}\nYou MUST address this error before proceeding.`);
  }

  return sections.join('\n\n');
}

// ===== Risky Action Detection =====

const RISKY_PATTERNS = [
  /\bwrite_file\b/i,
  /\bfile_delete\b/i,
  /\bdelete\b.*\bfile\b/i,
  /\bcommand_exec\b/i,
  /\bexecute\b.*\bcommand\b/i,
  /\brm\s+-rf\b/i,
  /\bformat\b.*\bdisk\b/i,
  /\bdrop\b.*\btable\b/i,
];

function detectRiskyActions(response: string): string | null {
  for (const pattern of RISKY_PATTERNS) {
    if (pattern.test(response)) {
      const match = response.match(pattern);
      return match ? match[0] : 'potentially destructive action';
    }
  }
  return null;
}

async function confirmRiskyAction(action: string): Promise<boolean> {
  // Check permission system first
  const permType = action.includes('file') ? 'file_write' as const
    : action.includes('delete') ? 'file_delete' as const
    : 'command_exec' as const;

  const perm = checkPermission(permType);
  if (perm === 'blocked') {
    logAuditEntry(`Autonomous: ${action}`, permType, false, 'Blocked by Safe Mode');
    return false;
  }
  if (perm === 'allowed') {
    logAuditEntry(`Autonomous: ${action}`, permType, true, 'Auto-confirmed by permission settings');
    return true;
  }

  // Need user confirmation — wait for UI to resolve
  return new Promise<boolean>((resolve) => {
    pendingConfirmation = { resolve, action };
    notifyState(); // UI will show the confirmation dialog
  });
}

// ===== Evaluation =====

function evaluateResponse(response: string): StepResult {
  const lower = response.toLowerCase();

  // Explicit completion signals
  if (response.includes('GOAL_COMPLETE') || /\b(goal|task)\s+(is\s+)?(now\s+)?complete/i.test(response)) {
    return { response, status: 'complete', reason: 'Goal marked as complete by AI' };
  }

  // Explicit blocked signals
  if (response.includes('GOAL_BLOCKED')) {
    const reason = response.match(/GOAL_BLOCKED:\s*(.+)/)?.[1] || 'Unknown blocker';
    return { response, status: 'blocked', reason };
  }

  // Error detection
  if (/\b(fatal error|cannot proceed|impossible to|unable to continue)\b/i.test(lower)) {
    return { response, status: 'failed', reason: 'AI indicated inability to proceed' };
  }

  // Repeated identical short responses may indicate a stuck loop
  if (response.length < 50 && /^(ok|done|sure|yes|understood)/i.test(response.trim())) {
    return { response, status: 'failed', reason: 'Response too short — possibly stuck' };
  }

  return { response, status: 'continue' };
}

// ===== Validation =====

function buildValidationPrompt(goal: string, lastStep: string): string {
  return `You just completed a step in an autonomous task. Evaluate your work:

GOAL: ${goal}
LAST STEP OUTPUT (truncated): ${lastStep.slice(0, 1000)}

Answer in this exact format:
VALIDATION: [PASS/FAIL]
PROGRESS: [percentage 0-100]
NEXT_ACTION: [brief description of what to do next, or "DONE" if complete]
ISSUES: [any problems found, or "none"]`;
}

// ===== Main Execution Loop =====

export async function runAutonomous(
  goal: string,
  onChunk: (chunk: string) => void,
  onStepComplete: (step: number, summary: string) => void,
  settings = loadSettings()
): Promise<string> {
  autonomousState = {
    active: true,
    currentGoal: goal,
    stepCount: 0,
    maxSteps: 20,
    shouldStop: false,
    currentPhase: 'planning',
    lastError: '',
    retryCount: 0,
  };
  notifyState();

  const task = await createTask(goal, ['Plan', 'Execute', 'Evaluate']);
  await updateTaskStatus(task.id, 'running');

  const conversationHistory: ChatMessage[] = [];
  const recentActions: string[] = [];
  let fullOutput = '';
  const MAX_RETRIES_PER_STEP = 2;

  // Gather context once up front
  let memoryContext = '';
  try { memoryContext = await getRelevantMemories(goal); } catch { /* ignore */ }
  const toolHints = getToolLearningHints();
  const route = routeToAgent(goal);

  try {
    // ===== PHASE 1: PLANNING =====
    autonomousState.currentPhase = 'planning';
    notifyState();

    const planningPrompt = `You are an autonomous AI agent executing a goal. You MUST:
1. Break the goal into specific, actionable steps (numbered)
2. For each step, identify what tool or action is needed
3. Consider potential failure points and fallback approaches
4. Begin executing step 1 immediately after planning

GOAL: ${goal}

IMPORTANT RULES:
- After each step, evaluate: is the goal complete? If yes, respond with "GOAL_COMPLETE".
- If blocked, respond with "GOAL_BLOCKED: <reason>".
- Always validate your results before moving on.
- If a step fails, try an alternative approach before giving up.

Create your numbered plan, then execute step 1.`;

    const contextBlock = buildFullContext(goal, 0, recentActions, memoryContext, toolHints, 'planning', '');
    const baseSystemPrompt = `${route.agent.systemPrompt}\n\n${contextBlock}\n\nYou are in AUTONOMOUS MODE. Execute tasks step by step without waiting for user input.`;

    conversationHistory.push({ role: 'user', content: planningPrompt });

    // ===== PHASE 2: EXECUTE → EVALUATE → REPEAT =====
    for (let step = 0; step < autonomousState.maxSteps; step++) {
      if (autonomousState.shouldStop) {
        await addTaskLog(task.id, 'Stopped by user');
        await updateTaskStatus(task.id, 'cancelled');
        break;
      }

      autonomousState.stepCount = step + 1;
      autonomousState.currentPhase = 'executing';
      notifyState();

      // Build fresh system prompt with updated context each step
      const stepContext = buildFullContext(
        goal, step + 1, recentActions.slice(-5), memoryContext, toolHints,
        'executing', autonomousState.lastError
      );
      const systemPrompt = `${route.agent.systemPrompt}\n\n${stepContext}\n\nYou are in AUTONOMOUS MODE. Execute tasks step by step.`;

      // --- Execute step with retry ---
      let stepResponse = '';
      let stepSuccess = false;
      let retries = 0;

      while (retries <= MAX_RETRIES_PER_STEP && !stepSuccess) {
        if (autonomousState.shouldStop) break;

        const startTime = Date.now();
        stepResponse = '';

        try {
          await sendChatMessage(
            [{ role: 'system', content: systemPrompt }, ...conversationHistory],
            { ...settings, systemPrompt: '' },
            (chunk) => {
              stepResponse += chunk;
              onChunk(chunk);
            }
          );
          stepSuccess = true;
          recordToolUse('autonomous_step', true, Date.now() - startTime);
        } catch (err) {
          retries++;
          const errMsg = err instanceof Error ? err.message : String(err);
          recordToolUse('autonomous_step', false, Date.now() - startTime, errMsg);

          if (retries <= MAX_RETRIES_PER_STEP) {
            autonomousState.currentPhase = 'recovering';
            autonomousState.lastError = errMsg;
            autonomousState.retryCount++;
            notifyState();
            await addTaskLog(task.id, `Step ${step + 1} failed (retry ${retries}/${MAX_RETRIES_PER_STEP}): ${errMsg}`);
            // Backoff before retry
            await new Promise(r => setTimeout(r, Math.pow(2, retries) * 1000));
          } else {
            // All retries exhausted — log and continue to next step
            await addTaskLog(task.id, `Step ${step + 1} failed after ${MAX_RETRIES_PER_STEP} retries: ${errMsg}`);
            autonomousState.lastError = errMsg;
            conversationHistory.push({
              role: 'user',
              content: `Step ${step + 1} FAILED with error: ${errMsg}. Try a different approach or skip to the next step. Remember the goal: ${goal}`,
            });
            onChunk(`\n\n⚠️ Step ${step + 1} failed: ${errMsg}. Attempting recovery...\n\n`);
            break;
          }
        }
      }

      if (!stepSuccess || autonomousState.shouldStop) continue;

      // --- Check for risky actions and confirm ---
      const riskyAction = detectRiskyActions(stepResponse);
      if (riskyAction) {
        const confirmed = await confirmRiskyAction(riskyAction);
        if (!confirmed) {
          await addTaskLog(task.id, `Step ${step + 1}: Risky action "${riskyAction}" REJECTED`);
          conversationHistory.push({ role: 'assistant', content: stepResponse });
          conversationHistory.push({
            role: 'user',
            content: `The action "${riskyAction}" was REJECTED by the user. Find an alternative approach that doesn't require this action. Goal: ${goal}`,
          });
          recentActions.push(`❌ Rejected: ${riskyAction}`);
          onChunk(`\n\n🛑 Action rejected: ${riskyAction}. Finding alternative...\n\n`);
          continue;
        }
        logAuditEntry(`Autonomous: ${riskyAction}`, 'command_exec', true, 'User confirmed', true);
      }

      // Record step
      fullOutput += stepResponse + '\n\n';
      conversationHistory.push({ role: 'assistant', content: stepResponse });
      const stepSummary = stepResponse.slice(0, 150).replace(/\n/g, ' ');
      recentActions.push(stepSummary);
      onStepComplete(step + 1, stepSummary);
      await addTaskLog(task.id, `Step ${step + 1}: ${stepSummary}...`);

      // --- Evaluate result ---
      autonomousState.currentPhase = 'evaluating';
      notifyState();

      const evaluation = evaluateResponse(stepResponse);

      if (evaluation.status === 'complete') {
        await addTaskLog(task.id, `Goal complete: ${evaluation.reason}`);
        await updateTaskStatus(task.id, 'completed');
        autonomousState.active = false;
        autonomousState.currentPhase = '';
        notifyState();
        return fullOutput;
      }

      if (evaluation.status === 'blocked') {
        await addTaskLog(task.id, `Goal blocked: ${evaluation.reason}`);
        await updateTaskStatus(task.id, 'failed', evaluation.reason);
        autonomousState.active = false;
        autonomousState.currentPhase = '';
        notifyState();
        return fullOutput;
      }

      if (evaluation.status === 'failed') {
        autonomousState.lastError = evaluation.reason || 'Step evaluation failed';
        await addTaskLog(task.id, `Step evaluation: FAIL — ${evaluation.reason}`);
      } else {
        autonomousState.lastError = '';
      }

      // --- Validation step (every 3 steps or if last step failed) ---
      if ((step + 1) % 3 === 0 || evaluation.status === 'failed') {
        let validationResponse = '';
        try {
          const validationPrompt = buildValidationPrompt(goal, stepResponse);
          await sendChatMessage(
            [
              { role: 'system', content: 'You are a task validator. Evaluate progress concisely.' },
              { role: 'user', content: validationPrompt },
            ],
            { ...settings, systemPrompt: '', maxTokens: 300 },
            (chunk) => { validationResponse += chunk; }
          );
          await addTaskLog(task.id, `Validation: ${validationResponse.slice(0, 200)}`);

          // Parse validation
          if (/VALIDATION:\s*FAIL/i.test(validationResponse)) {
            autonomousState.lastError = 'Validation failed — results did not meet expectations';
          }
          if (/NEXT_ACTION:\s*DONE/i.test(validationResponse)) {
            await updateTaskStatus(task.id, 'completed');
            autonomousState.active = false;
            autonomousState.currentPhase = '';
            notifyState();
            return fullOutput;
          }

          // Extract progress percentage for logging
          const progressMatch = validationResponse.match(/PROGRESS:\s*(\d+)/);
          if (progressMatch) {
            await addTaskLog(task.id, `Progress: ${progressMatch[1]}%`);
          }
        } catch {
          // Validation call failed — non-critical, continue
        }
      }

      // --- Continue prompt with recovery context ---
      const continueContent = autonomousState.lastError
        ? `Step ${step + 1} had issues: ${autonomousState.lastError}. Please address these issues and continue. If the original approach isn't working, try an alternative. Goal: ${goal}`
        : `Step ${step + 1} complete. Continue to the next step. Remember the goal: ${goal}`;

      conversationHistory.push({ role: 'user', content: continueContent });
    }

    // Max steps reached
    await addTaskLog(task.id, `Reached max steps (${autonomousState.maxSteps})`);
    await updateTaskStatus(task.id, 'completed');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateTaskStatus(task.id, 'failed', msg);
    onChunk(`\n\n❌ Autonomous mode error: ${msg}`);
  }

  autonomousState.active = false;
  autonomousState.currentPhase = '';
  notifyState();
  return fullOutput;
}
