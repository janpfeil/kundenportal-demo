import type { PostAuthenticationTriggerEvent } from "aws-lambda";
import type { Announce } from "./announce.js";

/**
 * Cognito "post authentication" trigger: announces a lazily migrated account after its
 * first sign-in (see `createAnnouncer`). It never fails the sign-in.
 */
export function createHandler(announce: Announce) {
  return async (event: PostAuthenticationTriggerEvent): Promise<PostAuthenticationTriggerEvent> => {
    await announce(event.request.userAttributes);
    return event;
  };
}
