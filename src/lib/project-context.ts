// Serialize App Builder project files into a compact context string for AI prompts

import { ProjectFile, Project } from './ide-types';
import { getProjects } from './ide-store';

/**
 * Get the current App Builder project (first project in storage).
 */
export function getCurrentProject(): Project | null {
  const projects = getProjects();
  return projects.length > 0 ? projects[0] : null;
}

/**
 * Build a file tree string showing all paths in the project.
 */
function buildFileTree(files: ProjectFile[], indent = ''): string {
  let result = '';
  for (const file of files) {
    if (file.isDirectory) {
      result += `${indent}📁 ${file.name}/\n`;
      if (file.children) {
        result += buildFileTree(file.children, indent + '  ');
      }
    } else {
      result += `${indent}📄 ${file.name}\n`;
    }
  }
  return result;
}

/**
 * Serialize file contents, truncating large files.
 */
function serializeFileContents(files: ProjectFile[], maxPerFile = 2000): string {
  let result = '';
  const flatFiles = flattenFiles(files);
  
  for (const file of flatFiles) {
    if (!file.content || file.isDirectory) continue;
    const truncated = file.content.length > maxPerFile
      ? file.content.slice(0, maxPerFile) + '\n// ... (truncated)'
      : file.content;
    result += `\n--- ${file.path} ---\n${truncated}\n`;
  }
  return result;
}

/**
 * Flatten nested file tree into a flat array.
 */
function flattenFiles(files: ProjectFile[]): ProjectFile[] {
  const result: ProjectFile[] = [];
  for (const file of files) {
    if (file.isDirectory && file.children) {
      result.push(...flattenFiles(file.children));
    } else {
      result.push(file);
    }
  }
  return result;
}

/**
 * Get project context summary for the AI system prompt.
 * Returns file tree + key file contents within a token budget.
 */
export function getProjectContext(maxTotalChars = 8000): string {
  const project = getCurrentProject();
  if (!project || project.files.length === 0) {
    return '';
  }

  const tree = buildFileTree(project.files);
  const fileCount = flattenFiles(project.files).filter(f => !f.isDirectory).length;
  
  let context = `## Current App Builder Project: "${project.name}" (${project.framework})\n`;
  context += `Files: ${fileCount} | Last updated: ${new Date(project.updatedAt).toLocaleString()}\n\n`;
  context += `### File Tree\n${tree}\n`;

  // Add file contents within budget
  const remainingBudget = maxTotalChars - context.length;
  if (remainingBudget > 500) {
    const maxPerFile = Math.max(500, Math.floor(remainingBudget / Math.max(fileCount, 1)));
    const contents = serializeFileContents(project.files, maxPerFile);
    if (contents.length <= remainingBudget) {
      context += `### File Contents\n${contents}`;
    } else {
      context += `### File Contents (partial)\n${contents.slice(0, remainingBudget)}`;
    }
  }

  return context;
}

/**
 * Get a brief summary of the project for display purposes.
 */
export function getProjectSummary(): { name: string; fileCount: number; framework: string } | null {
  const project = getCurrentProject();
  if (!project) return null;
  const fileCount = flattenFiles(project.files).filter(f => !f.isDirectory).length;
  return { name: project.name, fileCount, framework: project.framework };
}
