
// ################################################################################################
// From RUST

/// Called from the main Rust app to start the Web worker
function create_web_worker () {
	console.info ("Create web worker")
	globalThis.worker = new Worker('worker.js', { type: 'module' });
	globalThis.worker.onmessage = process_notifications;

	globalThis.game_started = false;
	globalThis.notifications = [];
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

	console.info ("JS - Main - load_nn_model");

	let msg = new Map([
		["kind", "load_nn_model"],
		["uri", consume_js_object(model_uri)],
		["nn_name", consume_js_object(model_name)],
	]);

	globalThis.num_nn_model_loading += 1;

	worker.postMessage(msg);
}

/// Called from the main Rust app to start a new game
/// `game_name`: the name of the game (e.g. Connect_4)
/// `agent_configs`: JSON string of a vector of [(agent_type, agent_name, parameters)]
/// `seed`: Game seed for PRNG
function start_game (game_name, agent_configs, seed) {

	console.info ("JS - Main - start_game");
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
	console.info ("JS - Main - Stop Game called");
	
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
		
		// Forward the notification to Rust
		if (kind === "buddy_notification") {
			console.info ("JS(Main) - Process Buddy Notification");
			let json_content = msg.get ("notification");
			wasm_exports.provide_next_notification (js_object(json_content));
		}

		// Echo the "validate notification", to inform the worker all the previous messages
		// have been processed.
		else if (kind === "validate") {
			console.info ("JS(Main) - Validate");
			globalThis.worker.postMessage (msg);
		}
		
		// End of game notification
		else if (kind === "end_of_game") {
			globalThis.game_started = false;
			globalThis.notifications = [];
			console.info ("JS(Main) - End of Game Notification");
		}

		else {
			console.error ("Unknown notification: ", msg);
		}
	}
}

/// Called from the main Rust app to transmit the human player action (as a JSON string).
function send_action (agent_handle, action) {
	console.info ("JS(Main) - Send Action")
	
	let msg = new Map([
	  ["kind", "send_action"],
	  ["agent_handle", agent_handle],
	  ["action", consume_js_object(action)],
	]);
	
	worker.postMessage(msg);
}

// ################################################################################################

/// Send a 'message' to the worker side, as a map containing at least the key "kind".
/// Then, wait until a response is received with the same "kind" value. In that case
/// the "result" value is read and returned.
function send_and_wait_response (message) {
    return new Promise((resolve) => {

		let incoming_kind = message.get ("kind");
		
		// Call resolve when the right message is read back
        globalThis.worker.onmessage = function(event) {
			let msg = event.data;
			let kind = msg.get ("kind");
			
			if (kind == incoming_kind) {
				
				// Get the result
				let result = msg.get ("result");
				
				// Default message handler
				globalThis.worker.onmessage = process_notifications;
				
				resolve(result);
			}
			else {
				console.warn ("JS(Main) - Dropping unexpected message", msg);
			}
        };

        worker.postMessage(message);
    });
}

/// Handler for the free notifications from the worker.
function process_notifications (event) {

	let msg = event.data;
	let kind = msg.get ("kind");

	// Response to a start game request
	if (kind === "start_game") {
		let result = msg.get ("result");
		console.info (" - start_game result: ", result);
		globalThis.game_started = result;
	}

	// Response to a stop game request
	else if (kind === "stop_game") {
		console.info (" - stop_game confirmation");
		globalThis.game_started = false;
		globalThis.notifications = [];
	}

	// NN model loading progress
	else if (kind === "nn_model_loading_progress") {
		let progress = msg.get ("progress_percent");
		console.debug ("JS(Main) - NN loading progress ", progress);

		globalThis.nn_model_loading_percent = progress;
		if (progress === 100) {
			globalThis.num_nn_model_loading -= 1;
			globalThis.nn_model_loading_percent = 0;
		}
	}

	// Notification
	else {
		// We collect them in a FIFO.
		globalThis.notifications.push(msg);
		console.debug("JS(Main) - push notification: ", msg);
	}
}

/// Plugin registration (https://macroquad.rs/articles/wasm/)
register_plugin = function (importObject) {
	
	console.info ("JS(Main) - Loading miniquad pluging");
	importObject.env.create_web_worker = create_web_worker;
	importObject.env.start_game = start_game;
	importObject.env.load_nn_model = load_nn_model;
	importObject.env.get_nn_model_loading_percent = get_nn_model_loading_percent;
	importObject.env.stop_game = stop_game;
	importObject.env.get_next_notification = get_next_notification;
	importObject.env.send_action = send_action;
	importObject.env.get_server_status = get_server_status;
}

// ################################################################################################

// miniquad_add_plugin receive an object with two fields: register_plugin and on_init. Both are functions, both are optional.
miniquad_add_plugin({register_plugin});
