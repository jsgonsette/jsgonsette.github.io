
// ################################################################################################
// From RUST

/// Called from the main Rust app to start the Web worker
function create_web_worker () {
	console.debug ("JS(Main) - Create web worker")
	globalThis.worker = new Worker('./worker.js', { type: 'module' });
	globalThis.worker.onmessage = process_notifications;

	globalThis.game_started = false;
	globalThis.remaining_chat_sessions = 0;
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

/// Called from the main Rust app to retrieve the language specified in the address.
/// If no language is specified, fallback to 'en' (English)
/// This function calls back 'provide_default_language' to return the answer.
function get_default_language () {

	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);

	let default_language = "en";
	if (urlParams.has ('lang')) {
		default_language = urlParams.get('lang');
	}

	wasm_exports.provide_default_language (js_object(default_language));
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

	globalThis.num_nn_model_loading += 1;

	worker.postMessage(msg);
}

/// Called from the main Rust app to activate a license
/// `license_key`: the license key (string)
/// `email`: the email of the user (string)
function activate_license (license_key, email) {
	console.debug ("JS(Main) - 'activate_license'");

	let msg = new Map([
		["kind", "activate_license"],
		["license_key", consume_js_object(license_key)],
		["email", consume_js_object(email)],
	]);

	worker.postMessage(msg);
}

/// Called from the main Rust app to refresh the list of available personas on the server
function refresh_available_personas (language) {
	console.debug ("JS(Main) - 'refresh_available_personas'");

	let msg = new Map([
		["kind", "refresh_available_personas"],
		["language", consume_js_object(language)],
	]);

	worker.postMessage(msg);
}

/// Called from the main Rust app to check the current license validity
function check_current_license () {
	console.debug ("JS(Main) - 'check_current_license'");

	// Check if the auto-activation is set in the local storage
	// If so, activate the license automatically instead of checking it
	let auto_activation_key = localStorage.getItem("auto_activation_key")
	let auto_activation_mail = localStorage.getItem("auto_activation_mail")

	if (auto_activation_key !== null && auto_activation_mail !== null) {
		localStorage.removeItem("auto_activation_key")
		localStorage.removeItem("auto_activation_mail")

		let msg = new Map([
			["kind", "activate_license"],
			["license_key", auto_activation_key],
			["email", auto_activation_mail],
		]);

		worker.postMessage(msg);
	}

	// Normal check of the current license
	else {
		let token = localStorage.getItem("token");
		let key = localStorage.getItem("key");
		let mail = localStorage.getItem("mail");

		let msg = new Map([
			["kind", "check_current_license"],
			["token", token ? token : ""],
			["key", key ? key : ""],
			["mail", mail ? mail : ""],
		]);

		worker.postMessage(msg);
	}
}

/// Called from the main Rust app to drop the current license
function drop_current_license () {
	console.debug ("JS(Main) - 'drop_current_license'");

	localStorage.setItem("token", "");
	localStorage.setItem("key", "");
	localStorage.setItem("mail", "");

	// Calling check with an empty license key and email will trigger a "no license" status
	let msg = new Map([
		["kind", "check_current_license"],
		["token", ""],
		["key", ""],
		["mail", ""],
	]);

	worker.postMessage(msg);
}

/// Called from the main Rust app to start a new game
/// `game_name`: the name of the game (e.g. Connect_4)
/// `actors`: JSON string of a vector of [Actor]
/// `agent_configs`: JSON string of a vector of [(agent_type, agent_name, parameters)]
/// `game_config`: JSON string of a Parameters object
/// `seed`: Game seed for PRNG
function start_game (game_name, actors, agent_configs, game_config, seed, language) {

	console.debug ("JS(Main) - 'start_game'");
	if (globalThis.game_started == true || globalThis.game_started === null) return false;

	let msg = new Map([
	  ["kind", "start_game"],
	  ["game", consume_js_object(game_name)],
      ["actors", consume_js_object(actors)],
	  ["agents", consume_js_object(agent_configs)],
	  ["game_config", consume_js_object(game_config)],
	  ["seed", seed],
	  ["language", consume_js_object(language)],
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

/// Return true on an Android device
function is_android_device () {

	const ua = navigator.userAgent.toLowerCase();
	return !(/ipad|mac/i.test(ua));
}

// ################################################################################################

/// Process the messages sent by the worker
function process_notifications (event) {

	console.debug('JS(Main) - Incoming Event: ', event.data);

	let msg = event.data;
	let kind = msg.get ("kind");

	// Response to a start game request
	if (kind === "start_game") {
		globalThis.game_started = msg.get ("result");
	}

	// Response to a license activation request
	else if (kind === "activate_license" || kind === "check_current_license") {
		let json_activation_status = msg.get ("result");
		wasm_exports.provide_license_status(js_object(json_activation_status));
	}

	else if (kind === "refresh_available_personas") {
		let json_remaining = msg.get ("result");
		wasm_exports.provide_personas(js_object(json_remaining));
	}

	/// Worker asking for the license content to be saved in the local storage
	else if (kind === "save_license_content") {
		localStorage.setItem("token", msg.get ("token"));
		localStorage.setItem("key", msg.get ("key"));
		localStorage.setItem("mail", msg.get ("mail"));
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

on_init = function () {

	// Check if the URL contains a license key and email for auto-activation
	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);

	if (urlParams.has ('key') && urlParams.has ('mail')) {
		console.debug ("JS(Main) - License key and email found in URL parameters");
		let key = urlParams.get('key')
		let mail = urlParams.get('mail')

		localStorage.setItem("auto_activation_key", key);
		localStorage.setItem("auto_activation_mail", mail);
	}
}

/// Plugin registration (https://macroquad.rs/articles/wasm/)
register_plugin = function (importObject) {
	
	console.debug ("JS(Main) - Loading miniquad plugin");
	importObject.env.create_web_worker = create_web_worker;
	importObject.env.start_game = start_game;
	importObject.env.get_default_language = get_default_language;
	importObject.env.activate_license = activate_license;
	importObject.env.refresh_available_personas = refresh_available_personas;
	importObject.env.check_current_license = check_current_license;
	importObject.env.drop_current_license = drop_current_license;
	importObject.env.load_nn_model = load_nn_model;
	importObject.env.get_nn_model_loading_percent = get_nn_model_loading_percent;
	importObject.env.stop_game = stop_game;
	importObject.env.get_next_notification = get_next_notification;
	importObject.env.get_last_llm_message = get_last_llm_message;
	importObject.env.send_action = send_action;
	importObject.env.get_server_status = get_server_status;
	importObject.env.is_android_device = is_android_device;
}

// ################################################################################################

// miniquad_add_plugin receive an object with two fields: register_plugin and on_init. Both are functions, both are optional.
miniquad_add_plugin({register_plugin, on_init});
