
// ################################################################################################
// From RUST

/// Called from the main Rust app to start the Web worker
function create_web_worker () {
	console.debug ("JS(Main) - Create web worker")
	globalThis.worker = new Worker('worker.js', { type: 'module' });
	globalThis.worker.onmessage = process_notifications;

	globalThis.game_started = false;
	globalThis.notifications = [];
	globalThis.last_llm_message = null;
	globalThis.num_nn_model_loading = 0;
	globalThis.nn_model_loading_percent = 0;
}

function get_nn_model_loading_percent () {
	if (globalThis.num_nn_model_loading === 0) return 100;
	else {
		return Math.round( globalThis.nn_model_loading_percent / globalThis.num_nn_model_loading );
	}
}

/// Start the loading of some NN model asynchronously.
/// The model must be located at the provided `model_uri`.
function load_nn_model (model_uri, model_name) {

	console.debug ("JS(Main) - 'load_nn_model'");

	let msg = new Map([
		["kind", "load_nn_model"],
		["uri", consume_js_object(model_uri)],
		["nn_name", consume_js_object(model_name)],
	]);

	globalThis.num_nn_model_loading += 1;""

	worker.postMessage(msg);
}

/// Called from the main Rust app to start a new game
/// `game_name`: the name of the game (e.g. Connect_4)
/// `agent_configs`: JSON string of a vector of [(agent_type, agent_name, parameters)]
/// `seed`: Game seed for PRNG
function start_game (game_name, agent_configs, seed) {

	console.debug ("JS(Main) - 'start_game'");
	if (globalThis.game_started == true || globalThis.game_started === null) return false;

	let msg = new Map([
	  ["kind", "start_game"],
	  ["game", consume_js_object(game_name)],
	  ["agents", consume_js_object(agent_configs)],
	  ["seed", seed],
	]);
	
	globalThis.game_started = null;
	globalThis.notifications = [];

	worker.postMessage(msg);
	return true;
}

/// Called from the main Rust app to stop the current game
function stop_game () {
	console.debug ("JS(Main) - 'stop_game'");
	
	let msg = new Map([
	  ["kind", "stop_game"],
	]);
	
	globalThis.game_started = null;
	worker.postMessage(msg);
}

/// Return the server status
/// 0: if no game running
/// 1: if some game running
/// 2: if a request is pending
function get_server_status () {
	if (globalThis.game_started === false) return 0;
	else if (globalThis.game_started === true) return 1;
	else /*if (globalThis.game_started === null)*/ return 2;
}

/// Called from the main Rust app to get the next notification
function get_next_notification () {
	
	if (globalThis.notifications.length > 0) {
		let msg = globalThis.notifications.shift ();
		let kind = msg.get ("kind");
		console.debug (`JS(Main) - 'get_next_notification': ${kind}`);

		// Forward the notification to Rust
		if (kind === "buddy_notification") {
			let json_content = msg.get ("notification");
			wasm_exports.provide_next_notification (js_object(json_content));
		}

		// Echo the "validate notification", to inform the worker all the previous messages
		// have been processed.
		else if (kind === "validate") {
			globalThis.worker.postMessage (msg);
		}
		
		// End of game notification
		else if (kind === "end_of_game") {
			globalThis.game_started = false;
			globalThis.notifications = [];
		}

		else {
			console.error ("JS(Main) - Unknown notification: ", msg);
		}
	}
}

/// Called from the main Rust app to get the last LLM message
function get_last_llm_message () {
	if (globalThis.last_llm_message != null) {
		wasm_exports.provide_last_llm_message(js_object(globalThis.last_llm_message));
		globalThis.last_llm_message = null;
	}
}

/// Called from the main Rust app to transmit the human player action (as a JSON string).
function send_action (agent_handle, action) {
	console.debug ("JS(Main) - Send Action")
	
	let msg = new Map([
	  ["kind", "send_action"],
	  ["agent_handle", agent_handle],
	  ["action", consume_js_object(action)],
	]);
	
	worker.postMessage(msg);
}

// ################################################################################################

/// Process the messages sent by the worker
function process_notifications (event) {

	console.debug('JS(Main) - Incoming Event: ', event.data);

	let msg = event.data;
	let kind = msg.get ("kind");

	// Response to a start game request
	if (kind === "start_game") {
		let result = msg.get ("result");
		globalThis.game_started = result;
	}

	// Response to a stop game request
	else if (kind === "stop_game") {
		globalThis.game_started = false;
		globalThis.notifications = [];
	}

	// NN model loading progress
	else if (kind === "nn_model_loading_progress") {
		let progress = msg.get ("progress_percent");

		globalThis.nn_model_loading_percent = progress;
		if (progress === 100) {
			globalThis.num_nn_model_loading -= 1;
			globalThis.nn_model_loading_percent = 0;
		}
	}

	/// LLM message to comment the game
	else if (kind === "llm_message") {
		globalThis.last_llm_message = msg.get ("notification");
	}

	// We collect the other ones in a FIFO.
	else {
		globalThis.notifications.push(msg);
	}
}

/// Plugin registration (https://macroquad.rs/articles/wasm/)
register_plugin = function (importObject) {
	
	console.debug ("JS(Main) - Loading miniquad plugin");
	importObject.env.create_web_worker = create_web_worker;
	importObject.env.start_game = start_game;
	importObject.env.load_nn_model = load_nn_model;
	importObject.env.get_nn_model_loading_percent = get_nn_model_loading_percent;
	importObject.env.stop_game = stop_game;
	importObject.env.get_next_notification = get_next_notification;
	importObject.env.get_last_llm_message = get_last_llm_message;
	importObject.env.send_action = send_action;
	importObject.env.get_server_status = get_server_status;
}

// ################################################################################################

// miniquad_add_plugin receive an object with two fields: register_plugin and on_init. Both are functions, both are optional.
miniquad_add_plugin({register_plugin});
