const { Meta } = imports.gi;

const Main = imports.ui.main;
const DND = imports.ui.dnd;


var DragAndDropSupport = class {
    
    constructor(targetWidget) {    
        this._targetWidget = targetWidget;
    }

    makeDraggable() {
        this._draggable = DND.makeDraggable(this._targetWidget, {
            dragActorOpacity: 128
        });
        this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
        this._draggable.connect('drag-cancelled', this._onDragCancelled.bind(this));
        this._draggable.connect('drag-end', this._onDragEnd.bind(this));
        this.inDrag = false;
        return this._draggable;
    }

    _onDragBegin(_draggable, _time) {
        this.inDrag = true;
        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this),
            dragDrop: this._onDragDrop.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);
    }

    _onDragDrop(dropEvent) {
        this._dropTarget = dropEvent.targetActor;
        global.display.set_cursor(Meta.Cursor.DEFAULT);
        this._draggable.emit('drag-end');
        this._draggable._dragComplete();
        return DND.DragDropResult.SUCCESS;
    }

    _onDragMotion(dropEvent) {   
        this._inDrag = true;
        this._targetWidget.set_position(dropEvent.dragActor.x, dropEvent.dragActor.y);
        this._dragToXY = [dropEvent.dragActor.x, dropEvent.dragActor.y];
        this._targetWidget._dragActor = dropEvent.dragActor;
        return DND.DragMotionResult.CONTINUE;
    }

    _onDragCancelled(_draggable, _time) {
        this._inDrag = false;
        this._targetWidget.set_position(this._draggable._dragOffsetX + this._draggable._dragX, this._draggable._dragOffsetY + this._draggable._dragY);

    }

    _onDragEnd(_draggable, _time, _snapback) {
        this._inDrag = false;
        DND.removeDragMonitor(this._dragMonitor);
        this._targetWidget.set_position(this._draggable._dragOffsetX + this._draggable._dragX, this._draggable._dragOffsetY + this._draggable._dragY);

    }

}