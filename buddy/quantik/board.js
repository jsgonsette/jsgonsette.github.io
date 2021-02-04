class QuantikBoard {
	
	constructor (context) {
		
		this.context = context
		this.droped_stone = null
	}
	
	/** ===========================================================================================
	* Return true if this object is busy animating something
	*/
	is_busy () {
		
		if (this.droped_stone != null) return true
		else return false
	}
			
	/** ===========================================================================================
	* Called to update state periodically
	*
	* @param {number}	dt		Time step [ms]
	*/
	update (dt) {	
	}
	
	/** ===========================================================================================
	* Called to draw the object
	*/
	draw () {		
		this._size_elements ()
		this._draw_board ()
	}

	/** ===========================================================================================
	* Get the coordinates of a board slot on screen 
	* @param {number}	col		Column
	* @param {number}	row		Row
	* @return 			[x, y], the coordinates in pixels
	*/
	get_slot_coo (col, row) {

		var step = this.board_size / 4
		var x = this.margin_w + step/2 + col * step
		var y = this.margin_h + step/2 + row * step

		return [x, y]
	}

	/** ===========================================================================================
	* Draw the Quantik board
	*/
	_draw_board () {
		
		var sqs = this.board_size / 2
		this.context.lineWidth = 4;

		this.context.fillStyle = "rgb(100, 100, 100)"
		this.context.fillRect (this.margin_w, this.margin_h, sqs, sqs);
		this.context.fillRect (this.margin_w+sqs, this.margin_h+sqs, sqs, sqs);

		this.context.fillStyle = "rgb(50, 50, 50)"
		this.context.fillRect (this.margin_w+sqs, this.margin_h, sqs, sqs);
		this.context.fillRect (this.margin_w, this.margin_h+sqs, sqs, sqs);

		this.context.strokeStyle = "rgba(250,250,250,0.5)";
		this.context.strokeRect (this.margin_w, this.margin_h, this.board_size, this.board_size);

		var step = this.board_size / 4
		var radius = this.board_size / 50
		for (let i = 0; i < 4; i++) {
			for (let j = 0; j < 4; j++) {
				var coo = this.get_slot_coo (i, j)

				this.context.beginPath();
				this.context.arc (coo [0], coo [1], radius, 0, 2 * Math.PI, false);
				this.context.fillStyle = 'black'; 
				this.context.fill();
				this.context.lineWidth = 2;
				this.context.strokeStyle = "rgba(250,250,250,0.5)";
			}
		}
	}
	
	/** ===========================================================================================
	* Size the drawing elements based on the screen size
	*/
	_size_elements () {

		this.w = this.context.canvas.width
		this.h = this.context.canvas.height

		if (this.w / this.h > 8/5) {
			this.board_size = 4 * this.h / 5
		}
		else {
			this.board_size = 4 * this.w / 8
		}
		this.margin_h = (this.h - this.board_size) / 2
		this.margin_w = (this.w - this.board_size) / 2
	}
}