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

    _onEvent(actor, event) {
        log('_onEvent')
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
                log('pressed escape')
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