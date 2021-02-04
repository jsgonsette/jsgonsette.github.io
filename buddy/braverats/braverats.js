class BraveRats extends Game {
	
	/** ===========================================================================================
	* Create a Connect4 game
	*
	* @param 			context		HTML5 canvas context
	* @param {string}	agent_1		'player', 'mcts' or 'random'
	* @param {string}	agent_2		'player', 'mcts' or 'random'
	* @param {Object}	language	Language dictionary
	*/			
	constructor (context, agent_1, agent_2, language) {
		
		// Ensure player comes first in the list
		var swap = 0
		if (agent_2 == 'player') {
			[agent_1, agent_2] = [agent_2, agent_1]
			swap = 1
		}

		super ("BraveRats", context, agent_1, agent_2)
		this._gui_player = -1
		this._action_request_id = -1
		this._winner = -1
		this._language = language
		this._figures = ["musician",  "princess", "spy", "assassin", "ambassador", "wizard", "general", "prince"]
		this._round = -1
		this._actions = []
		this._deck_blue = {}
		this._deck_red = {}
		this._scores = [0, 0, 0, 0, 0, 0, 0, 0]
		this._reveal = false
		this._swap_color = swap

		// Playable cards
		this._figures.forEach (f => this._deck_red [f] = new Card (context, f, this._swap_color))

		// Non playable cards
		this._figures.forEach (f => this._deck_blue [f] = new Card (context, f, 1-this._swap_color))
		this._figures.forEach (f => this._deck_blue [f].hidden = true)
	}
	
	/** ===========================================================================================
	* Called by the game loop to give chance to update the game periodically
	*
	* @param dt		Elpased time since last call [ms]
	*/
	update (dt) {		

		// Update non playable cards
		this._figures.forEach (f => {
			this._deck_blue [f].update (dt, this.mouse)
		})

		// Update playable cards
		this._figures.forEach (f => {

			var card = this._deck_red [f]
			card.update (dt, this.mouse)

			// Player has to play ?
			if (this._actions.length > 0 && card.slot == -1)	{
				
				// Deck cards can be selected
				card.make_selectable (true)
				
				// Action chosen on selection
				if (card.is_selected ()) {
					this._actions = []
					card.slot = this._round
					card.hidden = true
					var [x, y] = this.get_slot_coo (this._round, 0)
					card.move_to (x, y)
					this._buddy_client.reply_selected_action (this._action_request_id, f)
				}
			}
			else card.make_selectable (false)
		})

		// Reveal played cards
		if (this._reveal && this.is_busy () == false) {
			this._figures.forEach (f => {
				if (this._deck_blue [f].slot >=0) this._deck_blue [f].hidden = false
			})
			this._figures.forEach (f => {
				if (this._deck_red [f].slot >=0) this._deck_red [f].hidden = false
			})
			this._reveal = false
		}
	}
	
	/** ===========================================================================================
	* Called by the game loop to give chance to draw the game periodically
	*
	* @param dt		Elpased time since last call [ms]
	*/
	draw () {
		
		this._size_elements ()

		var i = 0
		this._figures.forEach (f => {
			
			// Draw non playable cards
			var card = this._deck_blue [f]
			var [x, y] = this.get_slot_coo (i, 2.5)
			if (card.slot >= 0) {
				[x, y] = this.get_slot_coo (card.slot, 1)
			}
			card.set_pos_size (x, y)
			card.draw ()
			
			// Draw playable cards
			var card = this._deck_red [f]
			var [x, y] = this.get_slot_coo (i, -1.5)
			if (card.slot >= 0) {
				[x, y] = this.get_slot_coo (card.slot, 0)
			}
			card.set_pos_size (x, y)
			card.draw ()

			// Draw help text of car is highlighted
			if (card.is_highlighted ()) {
				var key = `help_${f}`
				var font_size = this.context.canvas.width / 50
				var [x, y] = this.get_slot_coo (0, 1.75)
				this._draw_banner (this._language [key], "rgba(0, 0, 0, 0.6)", y, font_size)
			}
			
			i += 1
		})

		this._draw_scores ()
				
		// Draw winner banner
		if (this._winner != -1) {
			
			var [x, y] = this.get_slot_coo (0, 1.75)

			if (this._winner == this._swap_color)
				this._draw_banner (this._language.red_wins, "rgba(200, 0, 0, 0.6)", y, -1)

			else if (this._winner == (1-this._swap_color))
				this._draw_banner (this._language.blue_wins, "rgba(0, 0, 200, 0.6)", y, -1)
			
			else if (this._winner == 2)
				this._draw_banner (this._language.drawn, "rgba(200, 200, 200, 0.6)", y, -1)
		}
	}

	
	get_slot_coo (col, row)	 {

		var w = this.context.canvas.width
		var h = this.context.canvas.height
		var cw = this._deck_blue ['musician'].w
		var ch = this._deck_blue ['musician'].h

		var x = w / 2 - cw / 2 + cw * (col - 3)
		var y = h / 2 + ch / 2 - ch * (row - 0)

		return [x, y]
	}

	/** ===========================================================================================
	* Called by the game loop to know if the game is still busy animating anything
	*/
	is_busy () {
		var is_busy = false
		this._figures.forEach (f => {is_busy |= this._deck_red [f].is_busy ()})
		this._figures.forEach (f => {is_busy |= this._deck_blue [f].is_busy ()})
		return is_busy
	}
	
	/** ===========================================================================================
	* Draw the score of each round above the played cards
	*/
	_draw_scores () {

		var cw = this._deck_blue ['musician'].w
		var ch = this._deck_blue ['musician'].h
		var colors = ["rgba(200, 0, 0, 0.6)", "rgba(0, 0, 200, 0.6)"]

		var font_height = ch/3
		canvas.style.font = this.context.font;
		canvas.style.fontSize = `${font_height}px`;
		this.context.font = canvas.style.font;
		this.context.textAlign = "center";
		this.context.textBaseline = "middle"; 

		for (let i = 0; i < this._scores.length; i +=1) {

			var [x0, y0] = this.get_slot_coo (i, 0)
			var [x1, y1] = this.get_slot_coo (i, 1)
			if (this._scores [i] > 0) {
				
				this.context.fillStyle = colors [this._swap_color]
				this.context.fillRect (x0 - cw/2, y0-cw/4, cw, cw/2);
				this.context.fillStyle = "white";
				this.context.fillText (`+${this._scores [i]}`, x0, y0); 	

				this.context.fillStyle = "rgba(0, 0, 0, 0.4)"
				this.context.fillRect (x1 - cw/2, y1-ch/2, cw, ch);
			}
			if (this._scores [i] < 0) {
				
				this.context.fillStyle = colors [1 - this._swap_color]
				this.context.fillRect (x1 - cw/2, y1-cw/4, cw, cw/2);
				this.context.fillStyle = "white";
				this.context.fillText (`+${-this._scores [i]}`, x1, y1); 	

				this.context.fillStyle = "rgba(0, 0, 0, 0.4)"
				this.context.fillRect (x0 - cw/2, y0-ch/2, cw, ch);
			}
		}
	}
	
	/** ===========================================================================================
	* Size the drawing elements based on the screen size
	*/
	_size_elements () {

		var w = this.context.canvas.width
		var h = this.context.canvas.height
		var cw = this._deck_blue ['musician']._face_img.width
		var ch = this._deck_blue ['musician']._face_img.height

		var scale_x = (w * 0.9 / 8.0) / cw
		var scale_y = (h / 4.0) / ch
		var scale = Math.min (scale_x, scale_y)

		for (var name in this._deck_blue) {
			this._deck_blue [name].set_size (cw * scale)
		}
		for (var name in this._deck_red) {
			this._deck_red [name].set_size (cw * scale)
		}
	}
	
	/** ===========================================================================================
	* Called by the game loop when a new round of the game is about to start (the origin of this message is at the server side)
	*
	* @param {number} contest		Handle of the contest handle (required to communicate with the server)
	* @param {number} round_number	A counter givin wich round is about to start
	* @param {string} game_state	The current state of the game encoded into a string
	*/
	_round_start (contest, round_number, game_state) {
		this._round = round_number
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

		player_action.forEach (pa => {

			// Move card into position if action has not be performed through the GUI
			if (pa.number != this._gui_player) {
				
				var card
				if (pa.number == 0) card = this._deck_red [pa.action]
				else if (pa.number == 1) card = this._deck_blue [pa.action]
				
				card.slot = this._round
				card.hidden = true
				var [x, y] = this.get_slot_coo (this._round, pa.number)
				card.move_to (x, y)
			}
		})
		this._gui_player = -1
		this._reveal = true
	}

	/** ===========================================================================================
	* Called by the game loop at the end of a round (the origin of this message is at the server side)
	*
	* @param {number}	contest		Handle of the contest handle (required to communicate with the server)
	* @param {string}	game_state	The current state of the game encoded into a string
	* @param {[Object]}	rewards		Current reward for each player, as a list: [(player number, role, reward)]
	*/
	_round_end (contest, game_state, rewards) {
		
		// Get score up to this round
		var score_red = this._scores.filter (s => s > 0).reduce ( (acc, s) => acc +s, 0 )
		var score_blue = - this._scores.filter (s => s < 0).reduce ( (acc, s) => acc +s, 0 )

		// Compute score for this round
		var increase_blue = 0
		var increase_red = 0
		rewards.forEach ((row) => {
			if (row.number == 0) increase_red =	row.reward - score_red 
			else increase_blue = row.reward - score_blue
		})

		if (increase_red >  increase_blue) this._scores [this._round] = increase_red
		else this._scores [this._round] = - increase_blue

		// Detect draw game
		var game_tokens = game_state.split ('\n')
		if (game_tokens [game_tokens.length -1].toLowerCase () == "end") {
			score_red = this._scores.filter (s => s > 0).reduce ( (acc, s) => acc +s, 0 )
			score_blue = - this._scores.filter (s => s < 0).reduce ( (acc, s) => acc +s, 0 )
			
			if (score_red > score_blue) this._winner = 0
			else if (score_red < score_blue) this._winner = 1
			else this._winner = 2
		}
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
				this._actions = actions
			}
		)
	}
}