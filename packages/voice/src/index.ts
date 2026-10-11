// @sitdown/voice — E. Public API (so F/evals can drive the briefing builder and clients).
export { buildBriefing, rankSummaries, capPrompt, type BriefingOptions } from "./briefing.js";
export { behaviorBlock, type BehaviorOptions } from "./prompt.js";
export {
  makeMcpClient,
  HttpMcpClient,
  MockMcpClient,
  featureFromBranch,
  type McpClient,
  type PersonSummary,
  type DecisionItem,
  type SummaryItem,
  type Brief,
  type SearchResult,
  type LogUnansweredResult,
} from "./mcp.js";
export {
  makeDialer,
  DialClient,
  MockDial,
  type Dialer,
  type DialCall,
  type MakeCallOptions,
  type SendMessageOptions,
  type TranscriptTurn,
} from "./dial.js";
export { runFollowup, parseTranscript, turnsOf, topicOf, composeSms, type QA, type FollowupReport } from "./followup.js";
export { runStandupSms, composeTeamSummary, composePersonalStandup, type StandupReport } from "./standup-sms.js";
export {
  loadConfig,
  resolveAttendees,
  resolveAttendeePhone,
  expandHome,
  type Config,
} from "./config.js";
