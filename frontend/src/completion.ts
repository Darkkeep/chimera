import type { AssessmentSettings, CourseCompletionSettings, Scene } from "./App";

export type AssessmentOutcome = { attempts: number; isCorrect: boolean | null };

export type CourseEvaluation = {
  courseComplete: boolean;
  coursePassed: boolean;
  weightedScore: number | null;
  completedRequiredSceneCount: number;
  requiredSceneCount: number;
  completedRequiredAudioCount: number;
  requiredAudioTrackCount: number;
  requiredAudioSetupMissingCount: number;
};

function audioCompletionKey(sceneId: string, audioId: string): string {
  return `${sceneId}:${audioId}`;
}

function assessmentSettings(scene: Scene): AssessmentSettings {
  return scene.assessmentSettings ?? { maxAttempts: 2, passingScore: 100, scoreWeight: 1, remediationSceneId: null };
}

export function evaluateCourseCompletion(
  scenes: Scene[],
  completionSettings: CourseCompletionSettings,
  visitedSceneIds: string[],
  completedAudioKeys: string[],
  assessmentResults: Record<string, AssessmentOutcome | undefined>,
): CourseEvaluation {
  const visited = new Set(visitedSceneIds);
  const completedAudio = new Set(completedAudioKeys);
  const requiredScenes = scenes.filter((scene) => scene.required);
  const completedRequiredSceneCount = requiredScenes.filter((scene) => {
    if (!visited.has(scene.id)) return false;
    if (!scene.assessmentItem) return true;
    const result = assessmentResults[scene.id];
    return result !== undefined && result.attempts > 0
      && (result.isCorrect === true || result.attempts >= assessmentSettings(scene).maxAttempts);
  }).length;

  const requiredAudioScenes = scenes.filter((scene) => scene.audioRequired);
  const requiredAudioTrackCount = requiredAudioScenes.reduce((count, scene) => count + scene.audioAssets.length, 0);
  const completedRequiredAudioCount = requiredAudioScenes.reduce((count, scene) => count + scene.audioAssets.filter(
    (audioId) => completedAudio.has(audioCompletionKey(scene.id, audioId)),
  ).length, 0);
  const requiredAudioSetupMissingCount = requiredAudioScenes.filter((scene) => scene.audioAssets.length === 0).length;

  const scoredAssessments = scenes.filter((scene) => scene.assessmentItem && (
    scene.required || (completionSettings.includeOptionalAssessments && (assessmentResults[scene.id]?.attempts ?? 0) > 0)
  ));
  const totalWeight = scoredAssessments.reduce((sum, scene) => sum + assessmentSettings(scene).scoreWeight, 0);
  const weightedScore = totalWeight === 0 ? null : Math.round(scoredAssessments.reduce((sum, scene) => {
    const result = assessmentResults[scene.id];
    const percent = result?.isCorrect === true ? 100 : 0;
    return sum + percent * assessmentSettings(scene).scoreWeight;
  }, 0) / totalWeight);

  const courseComplete = scenes.length > 0
    && completedRequiredSceneCount === requiredScenes.length
    && completedRequiredAudioCount === requiredAudioTrackCount
    && requiredAudioSetupMissingCount === 0;
  const coursePassed = courseComplete && (weightedScore === null || weightedScore >= completionSettings.passingScore);

  return {
    courseComplete,
    coursePassed,
    weightedScore,
    completedRequiredSceneCount,
    requiredSceneCount: requiredScenes.length,
    completedRequiredAudioCount,
    requiredAudioTrackCount,
    requiredAudioSetupMissingCount,
  };
}