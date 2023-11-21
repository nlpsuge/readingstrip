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

        log('strip_h.get_actor() 2' + this.strip_h.get_actor())        

        this.dragAndDropSupport = new DragAndDropSupport.DragAndDropSupport(this.layout_h);
        const md = this.dragAndDropSupport.makeDraggable();

        Main.layoutManager.addChrome(this.layout_h);

        md.dragAndDropSupport = this.dragAndDropSupport;

        // create vertical strip
        this.strip_v = new St.Widget({
            reactive: true,
            can_focus: true,
            track_hover: true,
            visible: false
        });

        // Main.layoutManager.addChrome(this.strip_v);

        this.setting_changed_signal_ids = [];

        // synchronize extension state with current settings
        this.setting_changed_signal_ids.push(this.settings.connect('changed', () => {
            this._updateStrip();
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

    _updateStrip() {
        // this.strip_h.style is null
        log('this.strip_h.style b ' + this.strip_h.style);
        this.strip_h.style = 'background-color : ' + this.settings.get_string('color-strip');
        log('this.strip_h.style a ' + this.strip_h.style);
        this.strip_h.opacity = this.settings.get_double('opacity') * 255 / 100;
        log('this.strip_h.opacity ' + this.strip_h.opacity);
        let currentMonitor = Main.layoutManager.currentMonitor;
        this.strip_h.height = this.settings.get_double('height') * currentMonitor.height / 100;

        this.strip_v.visible = this.strip_h.visible && this.settings.get_boolean('vertical');
        this.strip_v.style = this.strip_h.style;
        this.strip_v.opacity = this.strip_h.opacity;
        this.strip_v.width = this.strip_h.height / 4;
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
        this.strip_h.visible = true;
        log('toggleReadingStrip ' + this.strip_h.visible)
        // this.settings.set_boolean('enabled', this.strip_h.visible);

        this._updateStrip();
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