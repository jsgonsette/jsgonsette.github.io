class Stone extends GameObject {

    constructor (context, type, player) {
        
        super ()
        this._type = type
        this._player = player
        this._context = context
        this._board = null
        this._board_coo = null
    }

	/** ===========================================================================================
	* Put a stone on the Quantik board
	* @param {Board}	board   The board to pin the stone onto
	* @param {number}	col		Board target column
	* @param {number}	row		Borad target row
	*/
    pin_on_board (board, col, row) {
        this._board = board
        this._board_coo = [col, row]
        this._status = "normal"
    }

	/** ===========================================================================================
    * Return true is the stone in on the board
    */
    is_on_board () {
        return (this._board != null)
    }

	/** ===========================================================================================
	* Return true if this object is busy animating something
    */
    is_busy () {
        if (this._status == "moving" || this._status.startsWith ("selected")) return true
        return false
    }

	/** ===========================================================================================
	* Called to update state periodically
	*
	* @param {number}	dt		Time step [ms]
    */
    update (dt, mouse) {

        this.update_object (dt, mouse)
    }

	/** ===========================================================================================
    * Called to draw the object
	*
	* @param {Object}	mouse   Mouse info
	*/
    draw (mouse) {

        // Update the stone location based on its state
        var x = this.x
        var y = this.y
        if (this._board != null && this._status != "moving") {
            var screen_coo = this._board.get_slot_coo (this._board_coo [0], this._board_coo [1])
            x = screen_coo [0]
            y = screen_coo [1]
        }
        else if (this._status.startsWith ("selected")) {
            x = mouse.x
            y = mouse.y

            if (this._landing_spots != null && this._near_spot_index >= 0) {
                x = this._landing_spots [this._near_spot_index] [0]
                y = this._landing_spots [this._near_spot_index] [1]
            }
        }
        else if (this._status == "spotted") {
            x = this._landing_spots [this._near_spot_index] [0]
            y = this._landing_spots [this._near_spot_index] [1]
        }

        this._draw_stone (x, y)
   }

	/** ===========================================================================================
    * Draw this stone at a given location
	*
	* @param {number}	x   Screen coordinte
	* @param {number}	y   Screen coordinte
	*/
    _draw_stone (x, y) {

        this._context.beginPath ()
        if (this._type == 'A') {
            this._context.rect (x - this.w/2, y - this.h/2, this.w, this.h)
        }
        else if (this._type == 'B') {
            this._context.arc (x, y, this.w/2, 0, 2 * Math.PI, false);
        }
        else if (this._type == 'C') {
            this._context.moveTo (x-this.w/2, y + this.h/2);
            this._context.lineTo (x, y - this.h/2);
            this._context.lineTo (x+this.w/2, y + this.h/2);
        }
        else if (this._type == 'D') {
            var s = this.w*2/10

            this._context.moveTo (x - this.w/2, y - s);
            this._context.lineTo (x - s,        y - s);
            this._context.lineTo (x - s,        y - this.h/2);
            this._context.lineTo (x + s,        y - this.h/2);
            this._context.lineTo (x + s,        y - s);
            this._context.lineTo (x + this.w/2, y - s);

            this._context.lineTo (x + this.w/2, y + s);
            this._context.lineTo (x + s,        y + s);
            this._context.lineTo (x + s,        y + this.h/2);
            this._context.lineTo (x - s,        y + this.h/2);
            this._context.lineTo (x - s,        y + s);
            this._context.lineTo (x - this.w/2, y + s);
        }

        this._context.closePath();

        if (this._player == 0) this._context.fillStyle = "white";
        else this._context.fillStyle = "Chocolate";

        this._context.strokeStyle = "dodgerblue";
		this._context.lineWidth = this.w/10;
        this._context.fill();
        
        if (this._status.startsWith ("selected") || this._status == "highlighted") this._context.stroke(); 
    }
}

