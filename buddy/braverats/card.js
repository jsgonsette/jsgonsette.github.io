class Card extends GameObject {

    // Image for the back of the card (same for every card)
    static _back_img = new Image ()
    
    constructor (context, card_name, player) {
        
        super ()
        this._card_name = card_name
        this._player = player
        this._context = context
        this._face_img = new Image();
        this._y_hover = 0

        this.hidden = false        
        this.slot = -1

        var color = "red"
        if (player == 1) color = "blue"        
        this._face_img.src = `./assets/${card_name}_${color}.webp`;
        
        if (Card._back_img.src == "") Card._back_img.src = `./assets/back.webp`;
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

        if (this._status == "highlighted") this._y_hover -= dt * this.h * 0.002
        else this._y_hover += dt * this.h * 0.002
        this._y_hover = Math.max (this._y_hover, this.y - this.h/2)
        this._y_hover = Math.min (this._y_hover, this.y)
    }

	/** ===========================================================================================
	* Called to draw the object
	*/
   draw () {

        var x = this.x - this.w / 2
        var y = this._y_hover - this.h / 2
        var img = this._face_img

        if (this.hidden) img = Card._back_img
        this._context.drawImage (img, 0, 0, this._face_img.width, this._face_img.height, x, y, this.w, this.h);
    }


	/** ===========================================================================================
	* Change the drawing size of the card. If only one dimension is given, scale the other proprotionaly
    */
    set_size (width=0, height=0) {

        if (width == 0) width = this._face_img.width * height / this._face_img.height
        if (height == 0) height = this._face_img.height * width / this._face_img.width
        this.w = width
        this.h = height
    }

}