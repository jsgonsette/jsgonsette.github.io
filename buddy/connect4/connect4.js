class Connect4 extends Game {
	
	/** ===========================================================================================
	* Create a Connect4 game
	*
	* @param 			context		HTML5 canvas context
	* @param {string}	agent_1		'player', 'mcts' or 'random'
	* @param {string}	agent_2		'player', 'mcts' or 'random'
	* @param {Object}	language	Language dictionary
	*/			
	constructor (context, agent_1, agent_2, language) {
		
		super ("Connect4", context, agent_1, agent_2)
		this.board = new Connect4Board (context)	
		this._gui_player = -1
		this._action_request_id = -1
		this._winner = -1
		this._language = language
	}

	
	/** ===========================================================================================
	* Called by the game loop to give chance to update the game periodically
	*
	* @param dt		Elpased time since last call [ms]
	*/
	update (dt) {		
		this.board.update (dt)
	}

	
	/** ===========================================================================================
	* Called by the game loop to give chance to draw the game periodically
	*
	* @param dt		Elpased time since last call [ms]
	*/
	draw () {
		this.board.draw ()
		
		// Draw a stone under the mouse if a player has to play through the GUI
		if (this._action_request_id != -1) {
			
			var x = this.mouse.x
			var y = this.mouse.y
			
			// Check for magnetism when the stone is above a column where we can play
			for (let col = 0; col < 7; col ++) {
				
				var hole_coo = this.board.get_hole_coo (col, 6)
				var d2 = (x - hole_coo [0]) * (x - hole_coo [0]) + (y - hole_coo [1]) * (y - hole_coo [1]) 
				var d_unit = Math.sqrt (d2) / this.board.cell_size
				
				// Magnetism on
				if (d_unit <= 0.5) {
					x = hole_coo [0]
					y = hole_coo [1]
					
					// Play the move if mouse button pressed
					if (this.mouse.buttons >= 1) {
						
						this.board.drop_stone (col, col, this._gui_player)
						
						var action = String (col +1)
						this._buddy_client.reply_selected_action (this._action_request_id, action)
						this._action_request_id = -1
					}
					
					break
				}
			}
			
			this.board._draw_stone ([x, y], this._gui_player)
		}
		
		// Draw winner banner
		if (this._winner != -1) {
			
			if (this._winner == 0)
				this._draw_banner (this._language.red_wins, "rgba(200, 0, 0, 0.6)")

			else if (this._winner == 1)
				this._draw_banner (this._language.yellow_wins, "rgba(200, 200, 0, 0.6)")
			
			else if (this._winner == 2)
				this._draw_banner (this._language.drawn, "rgba(200, 200, 200, 0.6)")
		}
	}

	
	/** ===========================================================================================
	* Called by the game loop to know if the game is still busy animating anything
	*/
	is_busy () {
		if (this.board.is_busy ()) return true
		else return false
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
	* @param {number} 	contest		Handle of the contest handle (required to communicate with the server)
	* @param {string} 	game_state	The current state of the game encoded into a string
	* @param {[Objet]}	player_action	Action chosen by each player, as a list: [(player number, role, action)]
	*/
	_turn_end (contest, game_state, player_action) {
		
		// If move the stone of a player playing at the server side
		player_action =player_action [0]
		if (player_action.number != this._gui_player) {
			var column = Number (player_action.action)
			this.board.drop_stone (3, column -1, player_action.number)
		}
		this._gui_player = -1
	}
	

	/** ===========================================================================================
	* Called by the game loop at the end of a round (the origin of this message is at the server side)
	*
	* @param {number}	contest		Handle of the contest handle (required to communicate with the server)
	* @param {string}	game_state	The current state of the game encoded into a string
	* @param {[Object]}	rewards		Current reward for each player, as a list: [(player number, role, reward)]
	*/
	_round_end (contest, game_state, rewards) {
		
		// Check for a winner
		rewards.forEach ((row) => {
			if (row.reward != 0) this._winner = row.number
		})

		// Detect draw game
		var game_tokens = game_state.split ('\n')
		if (game_tokens [game_tokens.length -1].toLowerCase () == "end" && this._winner < 0)
			this._winner = 2
	}
	
	
	/** ===========================================================================================
	* Called by the game loop to inform the server is waiting for the player chosen action
	*
	* @param {number} 	contest		Handle of the contest handle (required to communicate with the server)
	* @param {number} 	agent			Handle of the playing agent
	* @param {number} 	request_id	Id to put in the response to match the server request
	* @param {Object}	player		Target player as (player number, role)
	*/
	_get_agent_action (contest, agent, request_id, player) {
		
		// Collect legal actions and activate the GUI
		this._buddy_client.get_legal_actions (contest, agent).then (
			(actions) => {
				this._gui_player = player.number
				this._action_request_id = request_id
			}
		)
	}
}