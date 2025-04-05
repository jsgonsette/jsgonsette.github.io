/* tslint:disable */
/* eslint-disable */
/**
 * Schedules the game under control of the main application.
 */
export class Server {
  free(): void;
  /**
   * Called by the JS side to create a new Server.
   */
  constructor();
  /**
   * Called by the JS side to open a ONNX NN model from `raw_onnx_data` and to store it
   * under the model key `model_name`.
   */
  load_nn_model(model_name: string, raw_onnx_data: Uint8Array): void;
  /**
   * Called by the JS side to transmit the action selected by the human player
   */
  send_action(agent_handle: number, action_json: string): void;
  /**
   * Called by the JS side to schedule a new turn of the game.
   * This will trigger calls to function [process_notification](Self::process_notification).
   */
  schedule(): void;
  /**
   * Start a new game provided the following configuration:
   * * `game`: the name of the game.
   * * `agent_configs`: a JSON string describing the configuration of the different agents.
   */
  start_game(game: string, agent_configs: string, seed: bigint): boolean;
  /**
   * Stop the current game.
   */
  stop_game(): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_server_free: (a: number, b: number) => void;
  readonly server_new: () => number;
  readonly server_load_nn_model: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly server_send_action: (a: number, b: number, c: number, d: number) => void;
  readonly server_schedule: (a: number) => void;
  readonly server_start_game: (a: number, b: number, c: number, d: number, e: number, f: bigint) => number;
  readonly server_stop_game: (a: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
