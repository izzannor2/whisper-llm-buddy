// Autonomous Mode — AI plans and executes multi-step tasks without user input

import { sendChatMessage, loadSettings, ChatMessage } from './chat-api';
import { routeToAgent } from './agent-router';
import { getRelevantMemories } from './memory-store';
import { createTask, updateTaskStatus, addTaskLog, executeTask } from './orchestrator';

export interface AutonomousConfig {
  maxSteps: number;
  confirmDestructive: boolean;
  enabled: boolean;
}

let autonomousState = {
  active: false,
  currentGoal: '',
  stepCount: 0,
  maxSteps: 20,
  shouldStop: false,
};

let stateListeners: Array<(state: typeof autonomousState) => void> = [];

export function getAutonomousState() { return { ...autonomousState }; }

export function subscribeAutonomous(listener: (state: typeof autonomousState) => void): () => void {
  stateListeners.push(listener);
  return () => { stateListeners = stateListeners.filter(l => l !== listener); };
}

function notifyState() { stateListeners.forEach(l => l({ ...autonomousState })); }

export function stopAutonomous(): void {
  autonomousState.shouldStop = true;
  autonomousState.active = false;
  notifyState();
}

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
  };
  notifyState();

  const task = await createTask(goal, ['Plan', 'Execute', 'Evaluate']);
  await updateTaskStatus(task.id, 'running');

  const conversationHistory: ChatMessage[] = [];
  let fullOutput = '';

  const planningPrompt = `You are an autonomous AI agent. The user has given you a goal. You must:
1. Break the goal into specific, actionable steps
2. Execute each step
3. Evaluate the result
4. Continue until the goal is complete or you determine it cannot be completed

GOAL: ${goal}

First, create a numbered plan of steps to achieve this goal. Then begin executing step 1.
After each step, evaluate: is the goal complete? If yes, say "GOAL_COMPLETE". If not, continue to the next step.
If you encounter an error, try to fix it. If you cannot, say "GOAL_BLOCKED: <reason>".`;

  try {
    // Get memory context
    let memoryContext = '';
    try { memoryContext = await getRelevantMemories(goal); } catch { /* ignore */ }

    const route = routeToAgent(goal);
    const systemPrompt = `${route.agent.systemPrompt}\n${memoryContext}\n\nYou are in AUTONOMOUS MODE. Execute tasks step by step without waiting for user input.`;

    conversationHistory.push({ role: 'user', content: planningPrompt });

    for (let step = 0; step < autonomousState.maxSteps; step++) {
      if (autonomousState.shouldStop) {
        await addTaskLog(task.id, 'Stopped by user');
        await updateTaskStatus(task.id, 'cancelled');
        break;
      }

      autonomousState.stepCount = step + 1;
      notifyState();

      let stepResponse = '';
      await sendChatMessage(
        [{ role: 'system', content: systemPrompt }, ...conversationHistory],
        { ...settings, systemPrompt: '' },
        (chunk) => {
          stepResponse += chunk;
          onChunk(chunk);
        }
      );

      fullOutput += stepResponse + '\n\n';
      conversationHistory.push({ role: 'assistant', content: stepResponse });
      onStepComplete(step + 1, stepResponse.slice(0, 100));
      await addTaskLog(task.id, `Step ${step + 1}: ${stepResponse.slice(0, 100)}...`);

      // Check completion
      if (stepResponse.includes('GOAL_COMPLETE')) {
        await updateTaskStatus(task.id, 'completed');
        autonomousState.active = false;
        notifyState();
        return fullOutput;
      }

      if (stepResponse.includes('GOAL_BLOCKED')) {
        await updateTaskStatus(task.id, 'failed', 'Goal blocked');
        autonomousState.active = false;
        notifyState();
        return fullOutput;
      }

      // Auto-continue
      conversationHistory.push({
        role: 'user',
        content: `Step ${step + 1} complete. Continue to the next step. Remember the goal: ${goal}`,
      });
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
  notifyState();
  return fullOutput;
}
