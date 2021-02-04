class WebSocketClient {
	
	/** ===========================================================================================
	* Create a new websocket client
	*
	* @param {string}	uri 	The server address to connect to
	*/	
	constructor (uri) {
		this.ws = new WebSocket(uri)
		this.ws.onopen = this.ws_onopen
		this.ws.onmessage = this.ws_onmessage
		this.ws.onclose = this.ws_onclose
		this.ws.onerror = this.ws_onerror
		
		this.id_counter = 1
		
		this.in_queue = new Array ()
		this.out_queue = new Array ()
	}	
	
	/** ===========================================================================================
	* Return the ready state of the underlying websocket
	*
	* @retrun		Web socket ready state (WebSocket.CONNECTING, WebSocket.OPEN, etc.)
	*/
	status () {
		
		return this.ws.readyState
	}	
	
	/** ===========================================================================================
	* Send a request to the ws server and wait for the response
	*
	* @param name		Name of the request, to populate the "type" field
	* @param data		Any data that can be converted in JSON, to populate the "data" field of the message
	*/
	request = async (name, data=null) => {
		return await this._send_receive (name, data)
	}	

	/** ===========================================================================================
	* Send a response to the ws server
	*
	* @param id			Id of the initial request, to populate the "id" field
	* @param name		Name of the initial request, to populate the "type" field
	* @param data		Any data that can be converted in JSON, to populate the "data" field of the message
	*/
	response = async (id, name, data) => {
		await this._send_receive (name, data, true, id)
	}	
	
	/** ===========================================================================================
	* Callback triggered when the ws connection is established with the server
	*
	* @param e			ws event
	*/
	ws_onopen = (e) => {
		console.log (`[WS] Connection established`)	
	}
	
	/** ===========================================================================================
	* Callback triggered when a message is received from the ws server
	*
	* @param {string} message			Incoming message, in JSON format
	*/
	ws_onmessage = message => {

		// Parse, 
		var json_message = JSON.parse(message.data.replace ("\r\n", "")); 
		
		// and dispatch
		if (json_message.cat == 'signal') {
			console.log (`[WS] received signal: ${json_message.type}`)
			this.out_queue.push ([json_message.type, json_message.data, null])
		}
		else if (json_message.cat == 'request') {
			console.log (`[WS] received request: ${json_message.type}`)
			this.out_queue.push ([json_message.type, json_message.data, json_message.id])
		}
		else if (json_message.cat == 'response') {
			console.log (`[WS] received response: ${json_message.type}`)
			this.in_queue.push (json_message)
		}
		else {
			alert(`[WS] Unexpected server message: {json_message}`);
		}
	}	
	
	/** ===========================================================================================
	* Callback triggered when the ws connection is closed
	*
	* @param event			ws event
	*/
	ws_onclose = event => {
		if (event.wasClean) {
			console.log (`[WS] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
		} else {
			// e.g. server process killed or network down
			// event.code is usually 1006 in this case
			console.log  (`[WS] Connection died with code ${event.code}`);
		}
	}
	
	/** ===========================================================================================
	* Callback triggered in case of communication error
	*
	* @param error			ws error
	*/
	ws_onerror = error => {
		console.log (`[WS] Websocket error: ${error.message}`);
	}	
	
	/** ===========================================================================================
	* ASYNC: Send a message to the ws server and optionnaly wait for the response
	*
	* @param {string} 	name		Name of the request/response to populate the "type" field
	* @param 			data		Any data that can be converted in JSON, to populate the "data" field of the message
	* @param {boolean}	send_only	True if we send a response and don't except a answer
	* @param {number}	id_response	Id to insert in the response to match the previous incoming request
	* @returns 			The content of the response "data" field if we send a request. null otherwise
	*/
	async _send_receive (name, data, send_only=false, id_response=0) {
		
		var category = 'response'
		var message = new Object ()
		message.id = id_response		
		
		if (send_only == false) {
			category = 'request'
			message.id = this.id_counter
			this.id_counter += 1
		}
		
		message.cat = category
		message.type = name
		if (data != null) {
			message.data = data
		}		
		
		var json_message = JSON.stringify (message)
				
		while (true) {
			if (this.ws.readyState == WebSocket.CONNECTING) await this.sleep (200)
			else break
		}
		if (this.ws.readyState != WebSocket.OPEN) return null
		this.ws.send (json_message)
		
		console.log (`[WS Client] Sent message: ${json_message}`)

		if (send_only == false) {
			var response = await this._wait_response_id (message.id, this)
			console.log (`[WS Client] Got: ${response.data}`)
			return response.data
		}
		else return null
	}	
	
	/** ===========================================================================================
	* ASYNC: sleep
	* @param {number}	ms	Sleep duration in ms
	*/
	sleep (ms) {
		return new Promise(resolve => setTimeout(resolve, ms))
	}
	
	/** ===========================================================================================
	* ASYNC: Wait the answer of the ws server
	*
	* @param {number}	id	ID we are expecting
	* @returns			The received message that matches the given id
	*					null if the connection is closed before we could find the expected message
	*/
	_wait_response_id (id, parent) {

			return new Promise (function (resolve, reject) {
			(
			// Poll the incoming queue every x ms and check for a matching message inside
			function poll () {
				if (parent.ws.readyState == WebSocket.CONNECTING) setTimeout (poll, 500)				
				else if (parent.ws.readyState != WebSocket.OPEN) return null
				else {

					var msg = parent._find_response_message (id)

					if (msg != null) return resolve (msg)
					else setTimeout (poll, 500)
				}
			}
			) ()
		})
	}	
	
	/** ===========================================================================================
	* Check in the incoming queue if a message with a given id is present
	*
	* @param {number}	id	ID we are expecting
	* @returns			The matching message if found, null otherwise
	*/
	_find_response_message (id) {
		
		for (let i = 0; i < this.in_queue.length; i ++) {
			var msg = this.in_queue [i]
			if (msg.id == id)
			{
				this.in_queue.splice (i, 1)
				return msg
			}
		}
		
		return null
	}
}




