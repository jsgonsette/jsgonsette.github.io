class Connect4Board {
	
	constructor (context) {
		
		this.context = context
		this.color = '#175DDe'
		
		this.stones = []
		for (let y = 0;  y < 6; y ++) {
			
			var row = [-1, -1, -1, -1, -1, -1, -1]
			this.stones [y] = row
		}
		
		this.droped_stone = null
		
		this.yellow = new Image();
		this.red = new Image();
		this.yellow.src = "yellow.svg";
		this.red.src = "red.svg";
	}
	
	/** ===========================================================================================
	* Return true if this object is busy animating something
	*/
	is_busy () {
		
		if (this.droped_stone != null) return true
		else return false
	}	
	
	/** ===========================================================================================
	* Start the animation of a stone falling in a given column
	*/
	drop_stone (column_start, column_end, player) {

		this.droped_stone = new Object ()
		this.droped_stone.column = column_end
		this.droped_stone.row = 5
		this.droped_stone.x = column_start
		this.droped_stone.y = 6.0
		this.droped_stone.speed = 0.0
		this.droped_stone.player = player
		
		for (let y = 5; y >= 0; y --) {
			if (this.stones [y] [column_end] == -1) {
				this.droped_stone.row = y
			}
		}
	}
	
	/** ===========================================================================================
	* Called to update state periodically
	*
	* @param {number}	dt		Time step [ms]
	*/
	update (dt) {		
		if (this.droped_stone != null) {
			
			if (this.droped_stone.x != this.droped_stone.column) {
				
				var delta = this.droped_stone.column - this.droped_stone.x
				this.droped_stone.x += Math.sign (delta) * dt * 0.003
				var new_delta = this.droped_stone.column - this.droped_stone.x
				if (new_delta * delta < 0) {
					this.droped_stone.x = this.droped_stone.column
				}
			}
			
			else {
				this.droped_stone.speed += dt * 0.00002
				this.droped_stone.y -= this.droped_stone.speed * dt
				
				if (this.droped_stone.y < this.droped_stone.row) {
					this.stones [this.droped_stone.row] [this.droped_stone.column] = this.droped_stone.player
					this.droped_stone = null
				}
			}
		}
	}
	
	/** ===========================================================================================
	* Called to draw the object
	*/
	draw () {		
		this._size_elements ()
		this._draw_stones ()
		this._draw_droped_stone ()
		this._draw_board ()
	}
	
	/** ===========================================================================================
	* Get the coordinates of a board hole on screen 
	* @param {number}	col		Column
	* @param {number}	row		Row
	* @return 			[x, y], the coordinates in pixels
	*/
	get_hole_coo (col, row) {
		
		var x = this.margin_w + this.cell_size/2 + this.cell_size * col
		var y = this.h - this.margin_h - this.cell_size/2 - this.cell_size * row
		
		return [x, y]
	}
	
	/** ===========================================================================================
	* Draw a falling stone
	*
	* @param {number}	player_role		0 or 1 depending on the stone color
	*/
	_draw_droped_stone (player_role) {
		if (this.droped_stone != null) {			
			
			var coo = this.get_hole_coo (this.droped_stone.x, this.droped_stone.y)
			this._draw_stone (coo, this.droped_stone.player)			
		}
	}

	/** ===========================================================================================
	* Draw all the stones inside the board
	*/
	_draw_stones () {		
		for (let x = 0; x < 7; x ++) {
			for (let y = 0; y < 6; y ++) {
				
				if (this.stones [y][x] == -1) continue
				var coo = this.get_hole_coo (x, y)				
				var s = this.hole_size/2
				
				this._draw_stone (coo, this.stones [y][x])
			}
		}
	}
	
	/** ===========================================================================================
	* Draw a single stone at a given location on screen
	*
	* @param {[x, y]]}		coo				Screen coordinates
	* @param {number}		player_role		0 or 1 depending on the color
	*/
	_draw_stone (coo, player_role) {
		var img
		if (player_role == 0) img = this.red;
		else img = this.yellow;
		
		var s = this.hole_size/2
		this.context.drawImage (img, 0, 0, 200, 200, coo [0] - s, coo [1] - s, 2*s, 2*s);
	}
	
	/** ===========================================================================================
	* Draw the Connect 4 board
	*/
	_draw_board () {

		
		this.context.beginPath ()
		this.context.moveTo (this.margin_w, this.margin_h + this.cell_size);
		this.context.lineTo (this.w - this.margin_w, this.margin_h + this.cell_size);
		this.context.lineTo (this.w - this.margin_w, this.h - this.margin_h);
		this.context.lineTo (this.margin_w, this.h - this.margin_h);
		this.context.lineTo (this.margin_w, this.margin_h + this.cell_size);

		for (let x = 0; x < 7; x ++) {
			for (let y = 0; y < 6; y ++) {
				var coo = this.get_hole_coo (x, y)
				this.context.moveTo (coo [0] + this.hole_size/2, coo [1]);
				this.context.arc (coo [0], coo [1], this.hole_size/2, 0, 2 * Math.PI, true);
			}
		}
		
		this.context.closePath();
		
		this.context.fillStyle = this.color;
		this.context.strokeStyle = "rgba(0.5,0.5,0.5,0.5)";
		this.context.lineWidth = 2;
		this.context.fill();
		this.context.stroke();		
	}
	
	/** ===========================================================================================
	* Size the drawing elements based on the screen size
	*/
	_size_elements () {

		this.w = this.context.canvas.width
		this.h = this.context.canvas.height

		var sw = this.w * 0.9 / 7
		var sh = this.h * 0.9 / 7

		this.cell_size = Math.min (sw, sh)
		this.margin_h = (this.h - this.cell_size * 7) / 2
		this.margin_w = (this.w - this.cell_size * 7) / 2
		this.hole_size = this.cell_size * 0.8
	}
}