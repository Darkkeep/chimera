import type { TimelineClip } from '../../../frontend/src/scene-timeline';
export function clipProgressKey(sceneId:string,clip:TimelineClip):string;
export function scheduledAssets(scene:any):Set<string>;
export function requiredTimelineClips(scene:any):TimelineClip[];
