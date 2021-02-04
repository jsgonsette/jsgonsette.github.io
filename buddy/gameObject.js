class GameObject {

    constructor () {

        this.x = 0
        this.y = 0
        this.w = 0
        this.h = 0
        this._selectable = false
        this._status = "normal"
        this._landing_spots = []
        this._near_spot_index = -1
        this._moving = null
    }


    set_pos_size (x=-1, y=-1, w=-1, h=-1) {

        if (this._status == "moving") return
        if (x != -1) this.x = x
        if (y != -1) this.y = y
        if (w != -1) {
            if (h == -1) this.h = this.h * w / this.w
            this.w = w
        }
        if (h != -1) {
            if (w == -1) this.w = this.w * h / this.h
            this.h = h
        }
    }
   
    move_to (x, y) {

        this._moving = {ox:this.x, oy:this.y, dx:x, dy:y, t:0.0, tf:1.0}
        this._status = "moving"
    }

    make_selectable (status) {
        this._selectable = status
    }


    is_selected () {
        return this._status.startsWith ("selected")
    }

    is_highlighted () {
        return this._status == "highlighted"
    }

    set_landing_spots (spots) {
        if (spots == null) this._landing_spots = []
        this._landing_spots = spots
    }

    get_spot_index () {

        if (this._status != "spotted") return -1
        else return this._near_spot_index
    }

    update_object (dt, mouse) {

        // Change status to highlighted if mouse is over a selectable object
        if (this._status == "normal" || this._status == "highlighted") {

            var higlighted = this._selectable
            if (mouse.x < this.x - this.w/2 ) higlighted = false
            if (mouse.x > this.x + this.w/2 ) higlighted = false
            if (mouse.y < this.y - this.h/2 ) higlighted = false
            if (mouse.y > this.y + this.h/2 ) higlighted = false
            if (higlighted) this._status = "highlighted"
            else this._status = "normal"
        }

        // Start selection of highlighted object on click
        if (this._status == "highlighted") {
            if (mouse.buttons == 1) this._status = "selected_start"
        }
        if (this._status == "selected_start") {
            if (mouse.buttons == 0) this._status = "selected"
        }

        // Selected object can be droped on different landing spot -> magnetism
        if (this._status == "selected") {

            this._compute_near_spot (mouse)
            if (mouse.buttons == 2) this._status = "normal"
            if (mouse.buttons == 1 && this._near_spot_index >= 0) this._status = "spotted"
        }

        // Update position of moving object
        if (this._status == "moving") {

            this._moving.t += dt * 0.001
            if (this._moving.t >= this._moving.tf) this._moving.t = this._moving.tf
            this.x = this._moving.ox + (this._moving.dx - this._moving.ox) * this._moving.t / this._moving.tf
            this.y = this._moving.oy + (this._moving.dy - this._moving.oy) * this._moving.t / this._moving.tf

            if (this._moving.t >= this._moving.tf) {
                this._status = "normal"
                this._moving = null
            }
        }
    }

    _compute_near_spot (mouse) {
        
        var i = -1
        this._near_spot_index = -1
        this._landing_spots.forEach(spot => {
            i += 1
            var x = spot [0]
            var y = spot [1]

            var d2 = (x - mouse.x)*(x - mouse.x) + (y - mouse.y)*(y - mouse.y)
            if (d2 < this.w*this.w/4) this._near_spot_index  = i
        });
    }
}