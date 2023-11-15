const { St, Meta, Shell, Clutter, Gio } = imports.gi;

const Main = imports.ui.main;
const DND = imports.ui.dnd;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const DragAndDropSupport = Extension.imports.dragAndDropSupport;

var DragState = {
    INIT:      0,
    DRAGGING:  1,
    CANCELLED: 2,
};

var dragMonitors = [];

var ReadingStrip = class {

    constructor(settings, indicator) {
        this.settings = settings;

        this.layout_h = new St.BoxLayout({
            reactive: true,
            can_focus: true,
            track_hover: true,
            // visible: false,
            vertical: false,
        });

        // create horizontal strip
        this.strip_h = new St.Widget({
            reactive: true,
            can_focus: true,
            track_hover: true,
            visible: false
        });

        log('strip_h.get_actor() 1' + this.strip_h.get_actor())

        this.layout_h.add(this.strip_h);

        // this.strip_h.add_actor(this.layout_h);

        log('strip_h.get_actor() 2' + this.strip_h.get_actor())
        

        this.dragAndDropSupport = new DragAndDropSupport.DragAndDropSupport(this.layout_h);
        const md = this.dragAndDropSupport.makeDraggable();
        
        // Main.uiGroup.add_child(this.strip_h);
        // Main.uiGroup.add_child(this.strip_h.actor);
        // Main.uiGroup.add_actor(this.strip_h);
        // Main.layoutManager.addChrome(this.strip_h);
        Main.layoutManager.addChrome(this.layout_h);
        // Main.layoutManager.addChrome(this.strip_h.actor);
        // Main.layoutManager.addTopChrome(this.strip_h);

        // this.layout_h.connect('event', this._onEvent.bind(md));

        md.dragAndDropSupport = this.dragAndDropSupport;

        // md._dragActorDropped = this._dragActorDropped.bind(md);


        // create vertical strip
        this.strip_v = new St.Widget({
            reactive: true,
            can_focus: true,
            track_hover: true,
            visible: false
        });
        // Main.uiGroup.add_child(this.strip_v);
        // Main.layoutManager.addChrome(this.strip_v);
        // Main.uiGroup.addChrome(this.strip_v.actor);

        this.setting_changed_signal_ids = [];

        // synchronize extension state with current settings
        this.setting_changed_signal_ids.push(this.settings.connect('changed', () => {
            this.strip_h.style = 'background-color : ' + this.settings.get_string('color-strip');
            this.strip_h.opacity = this.settings.get_double('opacity') * 255/100;
            let currentMonitor = Main.layoutManager.currentMonitor;
            this.strip_h.height = this.settings.get_double('height') * currentMonitor.height/100;

            this.strip_v.visible = this.strip_h.visible && this.settings.get_boolean('vertical');
            this.strip_v.style = this.strip_h.style;
            this.strip_v.opacity = this.strip_h.opacity;
            this.strip_v.width = this.strip_h.height / 4;
        }));

        // load previous state
        if (this.settings.get_boolean('enabled'))
            this.toggleReadingStrip(indicator);

        // synchronize hot key
        Main.wm.addKeybinding('hotkey', settings,
                            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                            Shell.ActionMode.ALL,
                            () => {
                                this.toggleReadingStrip(indicator);
                            }
                            );

    }

    _dragActorDropped(event) {
        log('event ' + event + ' ' + this._eventIsRelease(event))
        let [dropX, dropY] = event.get_coords();
        log('dropX ' + dropX)
        log('dropY ' + dropY)
        let target = this._dragActor.get_stage().get_actor_at_pos(Clutter.PickMode.ALL,
                                                                  dropX, dropY);
        log('_dragActorDropped target ' + target)
        log('this._dragActor ' + this._dragActor)
        log('this._dragActor.get_stage() ' + this._dragActor.get_stage())
        // We call observers only once per motion with the innermost
        // target actor. If necessary, the observer can walk the
        // parent itself.
        let dropEvent = {
            dropActor: this._dragActor,
            targetActor: target,
            clutterEvent: event,
        };
        dragMonitors.push(this.dragAndDropSupport._dragMonitor);
        log('this.dragAndDropSupport._dragMonitor ' + this.dragAndDropSupport._dragMonitor)
        log('this.dragAndDropSupport._dragMonitor len' + this.dragAndDropSupport._dragMonitor.length)
        for (let i = 0; i < dragMonitors.length; i++) {
            let dropFunc = dragMonitors[i].dragDrop;
            if (dropFunc) {
                const dragDropResult = dropFunc(dropEvent);
                log('dragDropResult ' + dragDropResult)
                log('DND.DragMotionResult.SUCCESS ' + DND.DragMotionResult.SUCCESS)
                switch (dragDropResult) {
                case DND.DragDropResult.FAILURE:
                case DND.DragDropResult.SUCCESS:
                    return true;
                case DND.DragDropResult.CONTINUE:
                    continue;
                }
            }
        }

        // At this point it is too late to cancel a drag by destroying
        // the actor, the fate of which is decided by acceptDrop and its
        // side-effects
        this._dragCancellable = false;

        while (target) {
            log('xxxxx3 target ' + target)
            log('target._delegate ' + target._delegate)
            log('target._delegate.acceptDrop ' + target._delegate?.acceptDrop)
            if (target._delegate && target._delegate.acceptDrop) {
                log('xxxx4')
                let [r_, targX, targY] = target.transform_stage_point(dropX, dropY);
                let accepted = false;
                try {
                    accepted = target._delegate.acceptDrop(this.actor._delegate,
                        this._dragActor, targX, targY, event.get_time());
                    log('xxxx5 ' + accepted)
                } catch (e) {
                    // On error, skip this target
                    logError(e, "Skipping drag target");
                }
                if (accepted) {
                    // If it accepted the drop without taking the actor,
                    // handle it ourselves.
                    if (this._dragActor && this._dragActor.get_parent() == Main.uiGroup) {
                        if (this._restoreOnSuccess) {
                            this._restoreDragActor(event.get_time());
                            return true;
                        } else {
                            log('xxxx6 ')
                            this._dragActor.destroy();
                        }
                    }

                    this._dragState = DragState.INIT;
                    global.display.set_cursor(Meta.Cursor.DEFAULT);
                    this.emit('drag-end', event.get_time(), true);
                    this._dragComplete();
                    return true;
                }
            }
            target = target.get_parent();
        }

        log('xxxxx4 before _cancelDrag ' + target)
        log('xxxxx4 before _cancelDrag this._actorDestroyed ' + this._actorDestroyed)
        log('xxxxx4 before _cancelDrag this._dragState ' + this._dragState)
        log('xxxxx4 before _cancelDrag this._dragOrigParent ' + this._dragOrigParent)
        log('xxxxx4 before _cancelDrag this._dragActor ' + this._dragActor)
        // this._cancelDrag(event.get_time());

        const eventTime = event.get_time();
        this.emit('drag-cancelled', eventTime);
        let wasCancelled = this._dragState === DragState.CANCELLED;
        this._dragState = DragState.CANCELLED;

        log('wasCancelled ' + wasCancelled);
        log('this._actorDestroyed ' + this._actorDestroyed);
        if (this._actorDestroyed || wasCancelled) {
            global.display.set_cursor(Meta.Cursor.DEFAULT);
            this._dragComplete();
            this.emit('drag-end', eventTime, false);
            log('this._dragOrigParent ' + this._dragOrigParent);
            log('this._dragActor ' + this._dragActor);
            if (!this._dragOrigParent && this._dragActor)
                this._dragActor.destroy();

            return;
        }

        log('sssss ')
        let [snapBackX, snapBackY, snapBackScale] = this._getRestoreLocation();

        this._animateDragEnd(eventTime, {
            x: snapBackX,
            y: snapBackY,
            scale_x: snapBackScale,
            scale_y: snapBackScale,
            duration: SNAP_BACK_ANIMATION_TIME,
        });

        return true;
    }

    _onEvent(actor, event) {
        let device = event.get_device();

        if (this._grabbedDevice &&
            device != this._grabbedDevice &&
            device.get_device_type() != Clutter.InputDeviceType.KEYBOARD_DEVICE)
            return Clutter.EVENT_PROPAGATE;

        // We intercept BUTTON_RELEASE event to know that the button was released in case we
        // didn't start the drag, to drop the draggable in case the drag was in progress, and
        // to complete the drag and ensure that whatever happens to be under the pointer does
        // not get triggered if the drag was cancelled with Esc.
        if (this._eventIsRelease(event)) {
            this._buttonDown = false;
            if (this._dragState == DragState.DRAGGING) {
                log('run into _dragActorDropped ' + this._dragState)
                return this._dragActorDropped(event);
            } else if ((this._dragActor != null || this._dragState == DragState.CANCELLED) &&
                       !this._animationInProgress) {
                // Drag must have been cancelled with Esc.
                this._dragComplete();
                return Clutter.EVENT_STOP;
            } else {
                // Drag has never started.
                this._ungrabActor();
                return Clutter.EVENT_PROPAGATE;
            }
        // We intercept MOTION event to figure out if the drag has started and to draw
        // this._dragActor under the pointer when dragging is in progress
        } else if (event.type() == Clutter.EventType.MOTION ||
                   (event.type() == Clutter.EventType.TOUCH_UPDATE &&
                    global.display.is_pointer_emulating_sequence(event.get_event_sequence()))) {
            if (this._dragActor && this._dragState == DragState.DRAGGING)
                return this._updateDragPosition(event);
            else if (this._dragActor == null && this._dragState != DragState.CANCELLED)
                return this._maybeStartDrag(event);

        // We intercept KEY_PRESS event so that we can process Esc key press to cancel
        // dragging and ignore all other key presses.
        } else if (event.type() == Clutter.EventType.KEY_PRESS && this._dragState == DragState.DRAGGING) {
            let symbol = event.get_key_symbol();
            if (symbol == Clutter.KEY_Escape) {
                this._cancelDrag(event.get_time());
                return Clutter.EVENT_STOP;
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    // toggle strip on or off
    toggleReadingStrip(indicator) {
        const panelButtonIcon_on = Gio.icon_new_for_string(`${Extension.path}/icons/readingstrip-on-symbolic.svg`);
        const panelButtonIcon_off = Gio.icon_new_for_string(`${Extension.path}/icons/readingstrip-off-symbolic.svg`);

        if (this.strip_h.visible) {
            indicator.gicon = panelButtonIcon_off;
        } else {
            indicator.gicon = panelButtonIcon_on;
            this.syncStrip(true);
        }
        this.strip_h.visible = !this.strip_h.visible;
        this.strip_v.visible = this.strip_h.visible;
        log('toggleReadingStrip ' + this.strip_h.visible)
        this.settings.set_boolean('enabled', this.strip_h.visible);
    }

    // follow cursor position, and monitor as well
    syncStrip(monitor_changed = false) {
        const currentMonitor = Main.layoutManager.currentMonitor;
        const [x, y] = global.get_pointer();
        if (monitor_changed) {
            this.strip_h.x = currentMonitor.x;
            this.strip_h.width = currentMonitor.width;

            this.strip_v.x = x - this.strip_v.width;
            this.strip_v.height = currentMonitor.height;

        }

        this.strip_h.y = (y - this.strip_h.height / 2) + 200;
        this.strip_v.y = currentMonitor.y;
        log('syncStrip ' + this.strip_h.visible)
    }

    destroy() {
        log('destroy')
        Main.uiGroup.remove_child(this.strip_h);
        Main.uiGroup.remove_child(this.strip_v);

        if (this.setting_changed_signal_ids.length) {
            this.setting_changed_signal_ids.forEach(id => this.settings.disconnect(id));
            this.setting_changed_signal_ids = [];
        }

        if (this.strip_h) {
            this.strip_h.destroy();
            this.strip_h = null;
        }

        if (this.strip_v) {
            this.strip_v.destroy();
            this.strip_v = null;
        }

        if (this.dragAndDropSupport) {
            this.dragAndDropSupport = null;
        }
    }

}