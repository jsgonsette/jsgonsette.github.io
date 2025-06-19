import init, {Server} from './worker/buddy_worker.js';

// ################################################################################################
// From RUST

/// Called by Rust to send a 'BuddyNotification' to the main application.
/// * 'notification': a Rust BuddyNotification in JSON string
self.schedule_notification = function(notification) {

    console.debug("JS(Worker) - 'schedule_notification': ", notification);

	let msg = new Map([
	  ["kind", "buddy_notification"],
	  ["notification", notification],
	]);

	self.postMessage(msg);	
};

/// Called by Rust to send a tuple (player, llm message) to the main application.
/// * 'notification': JSON-encoded data
self.llm_message = function (notification) {

	console.debug("JS(Worker) - 'llm_message': ", notification);
	
	let msg = new Map([
		["kind", "llm_message"],
		["notification", notification],
	]);

	self.postMessage(msg);
}

/// Called by Rust to ask for validation before continuing scheduling the game.
/// The validation mechanism ensures the scheduler runs at the same pace as the game HMI.
self.validate = function () {

    console.debug("JS(Worker) - 'validate'");
	let msg = new Map([
	  ["kind", "validate"],
	]);
	self.postMessage(msg);
}

/// Called by Rust to inform the end of a game.
/// * reason: A string describing the reason the game ended.
self.end_of_game = function (reason) {

    console.debug("JS(Worker) - 'end_of_game'");
	globalThis.game_started = false;
	
	let msg = new Map([
	  ["kind", "end_of_game"],
	  ["reason", reason],
	]);
		
	self.postMessage(msg);
}

/// Called by Rust to save the license in a persistent storage.
self.save_license_content = function (token, key, mail) {

	let msg = new Map([
		["kind", "save_license_content"],
		["token", token],
		["key", key],
		["mail", mail],
	]);
	self.postMessage(msg);
}

// ################################################################################################

/// Called after init to indicate that the WASM module and the associated server are loaded and ready
let serverReady = new Promise((resolve) => {
    globalThis.serverReadyResolver = resolve;
});

/// Called at startup to load the WASM module and setup the server
async function run() {
	
	// Load the WASM in this Worker
	await init();
	
	// Create the Rust server and trigger the ready flag
	globalThis.server = new Server ();
	globalThis.serverReadyResolver();
	globalThis.game_started = false;
	globalThis.start_game_msg = null;

	globalThis.downloading_num = 0;
	globalThis.downloading_size = 0;
	globalThis.downloading_left = 0;
}

/// Process a message of kind: msg.get ("kind") === "start_game"
/// This processing is delayed until all the requested NN models are loaded.
async function process_start_game_msg () {

	if (globalThis.start_game_msg === null) return;
	if (globalThis.downloading_num > 0) return;

	let msg = globalThis.start_game_msg;
	globalThis.start_game_msg = null;

	// Request to start the game at the Rust worker side
	let game = msg.get ("game");
	let seed = BigInt (msg.get ("seed"));
	let agents = msg.get ("agents");
	let result = await globalThis.server.start_game (game, agents, seed);

	// Send the result back
	globalThis.game_started = result;
	msg.set ("result", result);
	self.postMessage(msg);

	// If the game is started, immediately launch the first scheduling round
	if (result == true) {
		await globalThis.server.schedule ();
	}
}

// ################################################################################################

/// Process messages sent by the main application thread 
self.onmessage = async (event) => {
	
	// Ensure we are ready and running before processing any incoming notification
	await serverReady;
	console.debug('JS(Worker) - Incoming Event: ', event.data);

	// Request to start a new game
	let msg = event.data;
	if (msg.get ("kind") === "start_game") {

		// Store the message and process now if possible.
		// Otherwise, the processing will be done when all the NN models are loaded.
		globalThis.start_game_msg = msg;
		await process_start_game_msg ();
	}

	// Request to activate a license key
	else if (msg.get ("kind") === "activate_license") {

		let license_key = msg.get ("license_key");
		let email = msg.get ("email");
		
		console.info("JS(Worker) - 'activate_license': ", license_key, email);
		let fingerprint = get_browser_fingerprint();
		let json_activation_status = await globalThis.server.activate_license (license_key, email, fingerprint);
		msg.set ("result", json_activation_status);
		self.postMessage(msg);
	}

	// Request to check the current license validity
	else if (msg.get ("kind") === "check_current_license") {
		console.info("JS(Worker) - 'check_current_license'");

		let token = msg.get ("token");
		let key = msg.get ("key");
		let mail = msg.get ("mail");
		let fingerprint = get_browser_fingerprint();

		let json_activation_status = await globalThis.server.check_current_license (token, key, mail, fingerprint);
		msg.set ("result", json_activation_status);
		self.postMessage(msg);
	}

	// Request to load a NN model
	else if (msg.get ("kind") === "load_nn_model") {

		let uri = msg.get ("uri");
		let model_name = msg.get ("nn_name");

		await load_nn_model(uri, model_name);
		await process_start_game_msg ();
	}

	else if (msg.get ("kind") === "stop_game") {

		// Request to stop the game at the Rust worker side
		globalThis.server.stop_game ();

		// Send the result back
		globalThis.game_started = false;
		msg.set ("result", true);
		self.postMessage(msg);		
	}
	
	else if (msg.get ("kind") === "validate") {
		// Schedule the next round when the validation message has been validated
		if (globalThis.game_started == true) {
			await globalThis.server.schedule ();
		}
	}
	
	else if (msg.get ("kind") === "send_action") {

		// Transmit the action to the Rust side
		let action_json = msg.get ("action");
		let agent_handle = msg.get ("agent_handle");
		globalThis.server.send_action (agent_handle, action_json);
		
		// continue scheduling the current turn
		await globalThis.server.schedule ();
	}
	
	else {
		console.error ("JS(Worker) - Invalid message: ", msg);
	}
};

/// Download a NN model, provided its `uri`
async function load_nn_model (uri, model_name) {

	globalThis.downloading_num += 1;

	const response = await fetch(uri);
	if (!response.ok) {
		console.error(`JS(Worker) - Cannot access model at ${uri}: ${response.statusText}`);
		globalThis.downloading_num -= 1;
		return;
	}

	const contentLength = response.headers.get("Content-Length");
	const totalSize = contentLength ? parseInt(contentLength, 10) : null;

	const reader = response.body.getReader();
	let receivedLength = 0;
	let chunks = [];
	globalThis.downloading_size += totalSize;
	globalThis.downloading_left += totalSize;

	// Downloading loop
	while (true) {

		// Get the next chunk of data
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);

		// Update the current progress
		receivedLength += value.length;
		globalThis.downloading_left -= value.length;

		// And notify the main app
		let progress = 100 - 100 * globalThis.downloading_left / globalThis.downloading_size;
		let reply = new Map([
			["kind", "nn_model_loading_progress"],
			["progress_percent", progress]
		]);
		self.postMessage(reply);

		//await new Promise(r => setTimeout(r, 10));
	}

	// Make a binary array from all those chunks
	let fullArray = new Uint8Array(receivedLength);
	let position = 0;
	for (let chunk of chunks) {
		fullArray.set(chunk, position);
		position += chunk.length;
	}

	// Open it at the Rust side
	server.load_nn_model(model_name, fullArray);

	// Housekeeping
	globalThis.downloading_num -= 1;
	if (globalThis.downloading_num == 0) {
		globalThis.downloading_left = 0;
		globalThis.downloading_size = 0;
	}
}

function get_browser_fingerprint () {
	return [
		navigator.userAgent,
		navigator.language,
//		screen.width + 'x' + screen.height,
//		screen.colorDepth,
		new Date().getTimezoneOffset(),
		navigator.hardwareConcurrency
	].join('|');
}

// ################################################################################################

run ();