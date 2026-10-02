import * as vscode from 'vscode'
import type { AssessmentPrompt, ModelClient } from '../assessment/index.js'

export const CONFIG_SECTION = 'skillInsights.aiAssessment'

export function aiAssessmentEnabled(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>(`${CONFIG_SECTION}.enabled`, true)
}

function configuredFamily(): string {
  return vscode.workspace.getConfiguration().get<string>(`${CONFIG_SECTION}.model`, '').trim()
}

/**
 * Any provider that registers with the language model API qualifies, so a Claude or
 * other BYOK extension satisfies this as well as Copilot Chat.
 */
export async function selectAssessmentModel(): Promise<vscode.LanguageModelChat | undefined> {
  const family = configuredFamily()
  if (family !== '') {
    const configured = await vscode.lm.selectChatModels({ family })
    if (configured[0] !== undefined) return configured[0]
  }
  const copilot = await vscode.lm.selectChatModels({ vendor: 'copilot' })
  if (copilot[0] !== undefined) return copilot[0]
  return (await vscode.lm.selectChatModels())[0]
}

export function modelLabel(model: vscode.LanguageModelChat): string {
  return `${model.name} (${model.vendor})`
}

/** Skill content is sent as a user message; it is never promoted to an instruction role. */
export function createModelClient(
  model: vscode.LanguageModelChat,
  token: vscode.CancellationToken,
): ModelClient {
  return {
    identity: { vendor: model.vendor, family: model.family, id: model.id },
    async complete(prompt: AssessmentPrompt): Promise<string> {
      const response = await model.sendRequest(
        [
          vscode.LanguageModelChatMessage.User(prompt.instructions),
          vscode.LanguageModelChatMessage.User(prompt.skillData),
        ],
        { justification: 'Skill Insights reviews the open skill definition.' },
        token,
      )
      let text = ''
      for await (const part of response.text) text += part
      return text
    },
  }
}

export function describeModelError(error: unknown): string {
  if (error instanceof vscode.LanguageModelError) {
    switch (error.code) {
      case 'NoPermissions':
        return 'Access to the language model was declined.'
      case 'Blocked':
        return 'The request was blocked, or the Copilot quota is exhausted.'
      case 'NotFound':
        return 'The selected language model is no longer available.'
      default:
        return error.message
    }
  }
  return error instanceof Error ? error.message : 'The assessment failed.'
}
