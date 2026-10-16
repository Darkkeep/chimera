import type { AssessmentItem, AssessmentSettings } from "./App";

export function AssessmentDraftPreview({ item, settings, label = "Draft assessment" }: { item: AssessmentItem; settings?: AssessmentSettings | null; label?: string }) {
  let choices: string[] = [];
  let answer = "";
  switch (item.type) {
    case "single-choice":
      choices = item.choices.map(choice => choice.text);
      answer = item.choices.find(choice => choice.identifier === item.correctResponse)?.text || item.correctResponse;
      break;
    case "multiple-response":
      choices = item.choices.map(choice => choice.text);
      answer = item.correctResponses.map(identifier => item.choices.find(choice => choice.identifier === identifier)?.text || identifier).join("; ");
      break;
    case "true-false":
      answer = item.correctResponse === "true" ? "True" : "False";
      break;
    case "ordering":
      choices = item.choices.map(choice => choice.text);
      answer = item.correctOrder.map(identifier => item.choices.find(choice => choice.identifier === identifier)?.text || identifier).join("; ");
      break;
    case "drag-drop":
      choices = [...item.draggables, ...item.targets].map(choice => choice.text);
      answer = item.correctMatches.map(pair => `${item.draggables.find(choice => choice.identifier === pair.sourceIdentifier)?.text || pair.sourceIdentifier}: ${item.targets.find(choice => choice.identifier === pair.targetIdentifier)?.text || pair.targetIdentifier}`).join("; ");
      break;
    case "matching":
      choices = [...item.leftItems, ...item.rightItems].map(choice => choice.text);
      answer = item.correctMatches.map(pair => `${item.leftItems.find(choice => choice.identifier === pair.sourceIdentifier)?.text || pair.sourceIdentifier}: ${item.rightItems.find(choice => choice.identifier === pair.targetIdentifier)?.text || pair.targetIdentifier}`).join("; ");
      break;
    case "short-answer":
      answer = item.acceptedAnswers.join("; ");
      break;
  }
  return <section aria-label={label}>
    <h3>Assessment</h3>
    <p>{item.prompt}</p>
    {choices.length > 0 && <ol>{choices.map((choice, index) => <li key={index}>{choice}</li>)}</ol>}
    <dl>
      <dt>Type</dt><dd>{item.type}</dd>
      <dt>Correct answer</dt><dd>{answer}</dd>
      <dt>Correct feedback</dt><dd>{item.correctFeedback}</dd>
      <dt>Incorrect feedback</dt><dd>{item.incorrectFeedback}</dd>
      {item.type === "short-answer" && <><dt>Case sensitive</dt><dd>{item.caseSensitive ? "Yes" : "No"}</dd></>}
      <dt>Attempts</dt><dd>{settings?.maxAttempts ?? 2}</dd>
      <dt>Passing score</dt><dd>{settings?.passingScore ?? 100}%</dd>
      <dt>Score weight</dt><dd>{settings?.scoreWeight ?? 1}</dd>
      {settings?.remediationSceneId && <><dt>Remediation scene</dt><dd>{settings.remediationSceneId}</dd></>}
    </dl>
  </section>;
}