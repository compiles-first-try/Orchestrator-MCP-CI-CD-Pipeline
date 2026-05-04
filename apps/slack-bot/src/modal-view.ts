import type { ModalSpec } from "./commands/router.js";

// Slack Block Kit view payload, narrowed to the bits the bot uses. Typed
// loosely (Record<string, unknown>) so we don't pull @slack/web-api typings
// into this module — the View shape is a stable Slack API contract.
export type SlackView = Record<string, unknown>;

// Slack imposes a 2500-char cap on `private_metadata`. Modal specs that
// would exceed this are rejected at build time so we never silently truncate.
const PRIVATE_METADATA_LIMIT = 2500;

export function buildSlackModalView(spec: ModalSpec): SlackView {
  if (spec.privateMetadata !== undefined && spec.privateMetadata.length > PRIVATE_METADATA_LIMIT) {
    throw new Error(
      `private_metadata exceeds Slack's ${PRIVATE_METADATA_LIMIT}-char limit (got ${spec.privateMetadata.length}).`,
    );
  }
  const blocks = spec.fields.map((field) => ({
    type: "input",
    block_id: field.key,
    // Slack defaults a missing `optional` to false; we invert so that fields
    // without `required: true` default to optional (matches most forms).
    optional: field.required !== true,
    label: { type: "plain_text", text: field.label.slice(0, 2000) },
    ...(field.hint !== undefined && {
      hint: { type: "plain_text", text: field.hint.slice(0, 2000) },
    }),
    element: {
      type: "plain_text_input",
      action_id: "value",
      ...(field.placeholder !== undefined && {
        placeholder: { type: "plain_text", text: field.placeholder.slice(0, 150) },
      }),
      ...(field.initialValue !== undefined && { initial_value: field.initialValue }),
    },
  }));

  return {
    type: "modal",
    callback_id: spec.callbackId,
    title: { type: "plain_text", text: spec.title.slice(0, 24) },
    submit: { type: "plain_text", text: (spec.submitText ?? "Submit").slice(0, 24) },
    close: { type: "plain_text", text: "Cancel" },
    ...(spec.privateMetadata !== undefined && { private_metadata: spec.privateMetadata }),
    blocks,
  };
}

// Slack returns view-submission values in the shape:
//   view.state.values[block_id][action_id] = { type: "plain_text_input", value: "..." }
// Since we use one block_id per field and a fixed action_id of "value",
// this collapses cleanly into a flat { [field_key]: string | undefined }
// map for downstream parsers.
export function extractFieldValues(view: {
  readonly state?: { readonly values?: Record<string, Record<string, { value?: string | null }>> };
}): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  const values = view.state?.values ?? {};
  for (const [blockId, actions] of Object.entries(values)) {
    const action = actions["value"];
    if (action === undefined) continue;
    out[blockId] = action.value === null ? undefined : action.value;
  }
  return out;
}
