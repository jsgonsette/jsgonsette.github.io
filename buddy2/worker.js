import init, {Server} from './worker/buddy_worker.js';

// ################################################################################################
// From RUST

/// Called by Rust to send a 'BuddyNotification' to the main application.
/// * 'notification': a Rust BuddyNotification in JSON string
self.schedule_notification = function(notification) {

    console.debug("JS(Worker) - Incoming schedule notification: ", notification);

	let msg = new Map([
	  ["kind", "buddy_notification"],
	  ["notification", notification],
	]);

	self.postMessage(msg);	
};

/// Called by Rust to ask for validation before continuing scheduling the game
self.validate = function () {

    console.debug("JS(Worker) - Ask for validation");
	let msg = new Map([
	  ["kind", "validate"],
	]);
	self.postMessage(msg);
}

/// Called by Rust to inform the end of a game
self.end_of_game = function (reason) {

    console.debug("JS(Worker) - End of Game");
	globalThis.game_started = false;
	
	let msg = new Map([
	  ["kind", "end_of_game"],
	  ["reason", reason],
	]);
		
	self.postMessage(msg);
}

// ################################################################################################

/// Called after init to indicate the WASM module and associated server are loaded and ready
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
}

// ################################################################################################

/// Process messages sent by the main application thread 
self.onmessage = async (event) => {
	
	// Ensure we are ready and running
	await serverReady;
	
	console.debug('JS(Worker) - Incoming message: ', event.data);
	
	let msg = event.data;
	if (msg.get ("kind") == "start_game") {

		// Request to start the game at the Rust worker side
		let game = msg.get ("game");
		let seed = BigInt (msg.get ("seed"));
		let agents = msg.get ("agents");
		let result = globalThis.server.start_game (game, agents, seed);

		// Send the result back
		globalThis.game_started = result;
		msg.set ("result", result);
		self.postMessage(msg);
		
		// If the game is started, launch immediately a first schedule round
		if (result == true) {
			globalThis.server.schedule ();
		}
	}
	
	else if (msg.get ("kind") == "stop_game") {

		// Request to stop the game at the Rust worker side
		globalThis.server.stop_game ();

		// Send the result back
		globalThis.game_started = false;
		msg.set ("result", true);
		self.postMessage(msg);		
	}
	
	else if (msg.get ("kind") == "validate") {
		// Schedule the next round when the validation message has been validated
		if (globalThis.game_started == true) {
			globalThis.server.schedule ();
		}
	}
	
	else if (msg.get ("kind") == "send_action") {

		// Transmit the action to the Rust side
		let action_json = msg.get ("action");
		let agent_handle = msg.get ("agent_handle");
		globalThis.server.send_action (agent_handle, action_json);
		
		// continue scheduling the current turn
		globalThis.server.schedule ();
	}
	
	else {
		console.error ("JS(Worker) - Invalid message: ", msg);
	}
};

// ################################################################################################

run ();