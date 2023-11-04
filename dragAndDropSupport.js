const Main = imports.ui.main;
const DND = imports.ui.dnd;


var DragAndDropSupport = class {
    
    constructor(targetWidget) {        
        

        if (!targetWidget.acceptDrop) {
            // Implement the acceptDrop function
            // So the widget dragging will not be disappeared because it is destroyed (not working TODO, override destroy function instead ),
            // See the dnd.js#_Draggable#_dragActorDropped source code for more details
            targetWidget.acceptDrop = function() {
                return true;
            }
        }

        if (!targetWidget._delegate) {
            // variable _delegate works with getDragActor, see getDragActor
            targetWidget._delegate = targetWidget;
        }

        if (!targetWidget._delegate.getDragActor) {
            // Implement the getDragActor function
            // getDragActor works with variable _delegate,
            // so the target widget can be moved by one-click of mouse
            targetWidget._delegate.getDragActor = function() {
                return targetWidget.get_actor();
            }
        }

        const actor = targetWidget._delegate.getDragActor();
        if (!actor.destroy) {
            actor.destroy = function() {
                // This function is called when drag is canceled, but the dialog should be always shown.
                // So we override it but do nothing.
            }
        }
        

        targetWidget.connect('notify::visible', () => {
            log('ddd visible')
        });

        targetWidget.connect('destroy', () => {
            log('ddd destroy')
        });


        this._targetWidget = targetWidget;
        log(this._targetWidget)
        log(this._targetWidget._delegate)
        log(this._targetWidget.acceptDrop)
        log(this._targetWidget.getDragActor)

    }

    makeDraggable() {
        this._draggable = DND.makeDraggable(this._targetWidget, {
            restoreOnSuccess: false,
            manualMode: false,
            dragActorMaxSize: null,
            dragActorOpacity: 128
        });
        this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
        this._draggable.connect('drag-cancelled', this._onDragCancelled.bind(this));
        this._draggable.connect('drag-end', this._onDragEnd.bind(this));
        this.inDrag = false;
        return this._draggable;
    }

    _onDragBegin(_draggable, _time) {
        // this._removeFromLayoutIfNecessary();

        this.inDrag = true;
        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this),
            dragDrop: this._onDragDrop.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);
    }

    _onDragDrop(dropEvent) {
        this._draggable._dragState = DND.DragState.DRAGGING;
        this._dropTarget = dropEvent.targetActor;
        log('_onDragDrop ' + this._targetWidget.visible)
        log('_onDragDrop DND.DragMotionResult.SUCCESS ' + DND.DragMotionResult.SUCCESS)
        log('_onDragDrop DND.DragDropResult.FAILURE ' + DND.DragDropResult.FAILURE)
        // return DND.DragMotionResult.SUCCESS;
        return DND.DragMotionResult.CONTINUE;
        // return 1;
    }

    _removeFromLayoutIfNecessary() {
        log('xxx1')
        if (Main.uiGroup.contains(this._targetWidget)) {
            log('xxx2')
            // Fix clutter_actor_add_child: assertion 'child->priv->parent == NULL' failed
            // complained by dnd.startDrag() https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/7ea0230a86dbee935b256171b07f2f8302917433/js/ui/dnd.js#L347
            Main.uiGroup.remove_child(this._targetWidget);
        }
    }

    _onDragMotion(dropEvent) {
        // let [dropX, dropY] = dropEvent.get_coords();
        // const target = actor.get_stage().get_actor_at_pos(Clutter.PickMode.ALL,
        //     dropX, dropY)
        // log('target ' + target)
        
        this._inDrag = true;
        this._targetWidget.set_position(dropEvent.dragActor.x, dropEvent.dragActor.y);
        this._dragToXY = [dropEvent.dragActor.x, dropEvent.dragActor.y];
        this._targetWidget._dragActor = dropEvent.dragActor;
        log('_onDragMotion ' + this._targetWidget.visible + ' ' + Main.uiGroup.contains(this._targetWidget))
        log('_onDragMotion DND.DragMotionResult.CONTINUE ' + DND.DragMotionResult.CONTINUE)
        return DND.DragMotionResult.CONTINUE;
    }

    _onDragCancelled(_draggable, _time) {
        this._inDrag = false;
        log('this._targetWidget drag cancel ' + this._targetWidget + ' ' + this._targetWidget.visible + ' ' + Main.uiGroup.contains(this._targetWidget))

    }

    _onDragEnd(_draggable, _time, _snapback) {
        this._inDrag = false;
        DND.removeDragMonitor(this._dragMonitor);
        log('this._targetWidget drag end ' + this._targetWidget)
    }

}