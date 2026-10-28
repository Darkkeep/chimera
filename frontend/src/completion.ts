import type { AssessmentSettings, CourseCompletionSettings, Scene } from "./App";

export type AssessmentOutcome = { attempts: number; isCorrect: boolean | null };
export type VideoProgress = { position: number; duration: number; watchedRanges: [number, number][] };

export type CourseEvaluation = {
  courseComplete: boolean;
  coursePassed: boolean;
  weightedScore: number | null;
  completedRequiredSceneCount: number;
  requiredSceneCount: number;
  completedRequiredAudioCount: number;
  requiredAudioTrackCount: number;
  requiredAudioSetupMissingCount: number;
  completedRequiredVideoCount: number;
  requiredVideoCount: number;
};

function audioCompletionKey(sceneId: string, audioId: string): string {
  return `${sceneId}:${audioId}`;
}

function assessmentSettings(scene: Scene): AssessmentSettings {
  return scene.assessmentSettings ?? { maxAttempts: 2, passingScore: 100, scoreWeight: 1, remediationSceneId: null };
}

export function videoWatchedSeconds(progress: VideoProgress | undefined): number {
  return progress?.watchedRanges.reduce((total, [start, end]) => total + Math.max(0, end - start), 0) ?? 0;
}

export function videoCoveragePercent(progress: VideoProgress | undefined): number {
  if (!progress || !Number.isFinite(progress.duration) || progress.duration <= 0) return 0;
  return Math.min(100, Math.floor(videoWatchedSeconds(progress) / progress.duration * 100));
}

export function evaluateCourseCompletion(
  scenes: Scene[],
  completionSettings: CourseCompletionSettings,
  visitedSceneIds: string[],
  completedAudioKeys: string[],
  videoProgress: Record<string, VideoProgress>,
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

  const requiredVideos = new Map<string, number>();
  for (const scene of scenes) {
    for (const placement of scene.mediaPlacements ?? []) {
      if (!placement.requiredViewing || !(scene.videoAssets ?? []).includes(placement.assetId)) continue;
      requiredVideos.set(placement.assetId, Math.max(requiredVideos.get(placement.assetId) ?? 0, placement.viewingThresholdPercent ?? 90));
    }
  }
  const completedRequiredVideoCount = [...requiredVideos].filter(([assetId, threshold]) => videoCoveragePercent(videoProgress[assetId]) >= threshold).length;

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
    && requiredAudioSetupMissingCount === 0
    && completedRequiredVideoCount === requiredVideos.size;
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
    completedRequiredVideoCount,
    requiredVideoCount: requiredVideos.size,
  };
}