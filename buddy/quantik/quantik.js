class Quantik extends Game {
	
	/** ===========================================================================================
	* Create a Quantik game
	*
	* @param context	HTML5 canvas context
	* @param {string}	agent_1		'player', 'mcts' or 'random'
	* @param {string}	agent_2		'player', 'mcts' or 'random'
	* @param {Object}	language	Language dictionary
	*/			
	constructor (context, agent_1, agent_2, language) {
		
		super ("Quantik", context, agent_1, agent_2)
		this.board = new QuantikBoard (context)	
		this._gui_player = -1
		this._action_request_id = -1
		this._winner = -1
		this._language = language
		this._actions = []

		// Create playing stones
		let forms = ['A', 'B', 'C', 'D']
		this.blacks = []
		this.whites = []
		forms.forEach (f => {

			this.blacks.push (new Stone (context, f, 0))
			this.blacks.push (new Stone (context, f, 0))
			this.whites.push (new Stone (context, f, 1))
			this.whites.push (new Stone (context, f, 1))
		})
	}
	
	/** ===========================================================================================
	* Called by the game loop to give chance to update the game periodically
	*
	* @param dt		Elpased time since last call [ms]
	*/
	update (dt) {	
		
		// Update board and stone
		this.board.update (dt)
		this.blacks.forEach (stone => {stone.update (dt, this.mouse)})
		this.whites.forEach (stone => {stone.update (dt, this.mouse)})

		// Handle stones manipulation with the mouse
		var stones = null
		if (this._gui_player == 0) stones = this.blacks
		else stones = this.whites

		var one_selected = false
		stones.forEach (stone => {
	
			// Set landing spots for the selected stone, based on the legal action including this stone
			if (stone.is_selected ()) {
				one_selected = true
				stone.set_landing_spots (this._get_landing_spots (stone))
			}

			// A stone has been put on the board ? validate this action
			var index = stone.get_spot_index ()
			if (index >= 0 && index < this._actions.length) {

				var action = this._actions.filter (a => a.stone == stone._type) [index]
				stone.pin_on_board (this.board, action.x, action.y)
				this._buddy_client.reply_selected_action (this._action_request_id, `(${action.x},${action.y},${action.stone})`)

				this._actions = []
				this._action_request_id = -1
			}
		})

		// If some player plays through the GUI, enable selection of its stones
		if (stones != null && this._actions.length > 0) {
			stones.forEach (stone => {stone.make_selectable (!one_selected && !stone.is_on_board ())})
		}
	}
	
	/** ===========================================================================================
	* Called by the game loop to give chance to draw the game periodically
	*
	* @param dt		Elpased time since last call [ms]
	*/
	draw () {

		// Draw board
		this.board.draw ()

		// Draw each stone, with anchor set beside the board
		var draw_above = []
		let stone_size = this.board.board_size / 8

		let i = 0
		this.blacks.forEach (stone => {
			
			var coo = this.board.get_slot_coo (4 + i%2, Math.floor (i/2))
			stone.set_pos_size (coo [0], coo [1], stone_size, stone_size)
			if (stone.is_selected () == false) stone.draw (this.mouse)
			else draw_above.push (stone)

			i += 1
		})

		i = 0
		this.whites.forEach (stone => {
			
			var coo = this.board.get_slot_coo (-1 - i%2, Math.floor (i/2))
			stone.set_pos_size (coo [0], coo [1], stone_size, stone_size)
			if (stone.is_selected () == false) stone.draw (this.mouse)
			else draw_above.push (stone)

			i += 1
		})

		draw_above.forEach (stone => {stone.draw (this.mouse)})

		// Draw winner banner
		if (this._winner != -1) {
			
			if (this._winner == 0)
				this._draw_banner (this._language.white_wins, "rgba(200, 200, 200, 0.6)")

			else if (this._winner == 1)
				this._draw_banner (this._language.brown_wins, "rgba(200, 100, 0, 0.6)")
		}
	}
	
	/** ===========================================================================================
	* Called by the game loop to know if the game is still busy animating anything
	*/
	is_busy () {

		if (this.board.is_busy ()) return true

		var is_busy = false
		this.blacks.forEach (stone => {is_busy |= stone.is_busy ()})
		this.whites.forEach (stone => {is_busy |= stone.is_busy ()})
		return is_busy
	}
			
	/** ===========================================================================================
	* Called by the game loop when a new round of the game is about to start (the origin of this message is at the server side)
	*
	* @param {number} contest		Handle of the contest handle (required to communicate with the server)
	* @param {number} round_number	A counter givin wich round is about to start
	* @param {string} game_state	The current state of the game encoded into a string
	*/
	_round_start (contest, round_number, game_state) {
	}			
		
	/** ===========================================================================================
	* Called by the game loop when a new turn of the game is about to start (the origin of this message is at the server side)
	*
	* @param {number} contest		Handle of the contest handle (required to communicate with the server)
	* @param {number} round_number	A counter giving wich round is about to start
	* @param {number} step			Counter incremented for each player playing simultaneously during this turn
	* @param {string} game_state	The current state of the game encoded into a string
	* @param {Objet}  player		The player who has to play now
	*/
	_turn_start (contest, round_number, step, game_state, player) {
	}
	
	/** ===========================================================================================
	* Called by the game loop at the end of a turn (the origin of this message is at the server side)
	*
	* @param {number} 	contest			Handle of the contest handle (required to communicate with the server)
	* @param {string}	game_state		The current state of the game encoded into a string
	* @param {[Objet]}	player_action	Action chosen by each player, as a list: [(player number, role, action)]
	*/
	_turn_end (contest, game_state, player_action) {
		
		player_action = player_action [0]
		if (player_action.number != this._gui_player) {
			var action = this._decode_actions ([player_action.action]) [0]

			// Chose a free stone to put on the board
			var stones = this.blacks
			if (player_action.number == 1) stones = this.whites
			
			var chosen_stone = stones.filter (stone => stone.is_on_board () == false && stone._type == action.stone ) [0]

			var board_coo = this.board.get_slot_coo (action.x, action.y)
			chosen_stone.pin_on_board (this.board, action.x, action.y)
			chosen_stone.move_to (board_coo [0], board_coo [1])
		}
		else this._gui_player = -1		
	}
	
	/** ===========================================================================================
	* Called by the game loop at the end of a round (the origin of this message is at the server side)
	*
	* @param {number}	contest		Handle of the contest handle (required to communicate with the server)
	* @param {string} 	game_state	The current state of the game encoded into a string
	* @param {[Object]}	rewards		Current reward for each player, as a list: [(number, role, reward)]
	*/
	_round_end (contest, game_state, rewards) {
		rewards.forEach ((row) => {
			
			if (row.reward != 0) {this._winner = row.number}
		})
	}	
	
	/** ===========================================================================================
	* Called by the game loop to inform the server is waiting for the player chosen action
	*
	* @param {number}	contest		Handle of the contest handle (required to communicate with the server)
	* @param {number} 	agent		Handle of the playing agent
	* @param {number} 	request_id	Id to put in the response to match the server request
	* @param {Object}	player		Target player as (player number, role)
	*/
	_get_agent_action (contest, agent, request_id, player) {
		
		this._buddy_client.get_legal_actions (contest, agent).then (
			(actions) => {
				this._gui_player = player.number
				this._action_request_id = request_id
				this._actions = this._decode_actions (actions)
			}
		)		
	}

	/** ===========================================================================================
	* Decode legal actions from strings to handy objects. An action has the form (x, y, stone),
	* with 'x', 'y' the board coordinates and 'stone' the kind of stone (A, B, C or D)
	*
	* @param  actions_string		Array of strings, each item being a legal action
	* @returns						An array of objects, each item being the decoded action
	*/
	_decode_actions (actions_string) {

		var actions = []
		actions_string.forEach (action_str => {
			var tokens = action_str.substring (1, action_str.length-1).split (',')
			var x = Number (tokens [0])
			var y = Number (tokens [1])
			var stone = tokens [2]

			actions.push ({x:x, y:y, stone:stone})
		})
		return actions
	}

	/** ===========================================================================================
	* Get the list of coordinates, on screen, where we can put a given stone 
	*
	* @param  stone		Target stone
	* @returns			A list of screen coordinates
	*/
	_get_landing_spots (stone)
	{
		var spots = []
		this._actions.forEach (action => {

			if (stone._type == action.stone) {
				spots.push (this.board.get_slot_coo (action.x, action.y))
			}
		})
		return spots
	}
}