const { St, Meta, Shell, Clutter, Gio, GLib } = imports.gi;

const Main = imports.ui.main;
const DND = imports.ui.dnd;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const DragAndDropSupport = Extension.imports.dragAndDropSupport;
const WindowPicker = Extension.imports.utils.WindowPicker;
const MetaWindowUtils = Extension.imports.utils.metaWindowUtils;


var ReadingStrip = class {

    constructor(settings, indicator) {
        this.settings = settings;

        this.setting_changed_signal_ids = [];

        // synchronize hot key
        Main.wm.addKeybinding('hotkey', settings,
                            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                            Shell.ActionMode.ALL,
                            () => {
                                this.toggleReadingStrip(indicator);
                            }
                            );

    }

    toggleReadingStrip(indicator) {
        if (this._dbusConnection) {
			// Unsubscribe the existing PickWindow DBus service, just in case of modifying another entry.
			Gio.DBus.session.signal_unsubscribe(this._dbusConnection);
			this._dbusConnection = null;
		}

        Gio.DBus.session.call(
			'org.gnome.Shell',
			'/org/gnome/shell/extensions/stripcover',
			'org.gnome.Shell.Extensions.stripcover.PickWindow', 'PickWindow',
			null, null, Gio.DBusCallFlags.NO_AUTO_START, -1, null, null);

		this._dbusConnection = this._subscribeSignal('WindowPicked', (conn, sender, obj_path, iface, signal, windowIdVariant) => {
			// Unsubscribe the PickWindow DBus service, it's really no necessary to keep the subscription all the time
			Gio.DBus.session.signal_unsubscribe(this._dbusConnection);
			this._dbusConnection = null;

			const windowIdArray = windowIdVariant.recursiveUnpack();
			// Pick nothing, so we ignore this pick
			if(!windowIdArray.length) {
				return;
			}

			const [windowId] = windowIdArray;

            let targetMetaWindow = this.getMetaWindowById(windowId);
            if (targetMetaWindow) {
                const targetMetaWindowRect = targetMetaWindow.get_frame_rect();
                const y = targetMetaWindowRect.y + Math.round(targetMetaWindowRect.height * 0.8);
                log(targetMetaWindow.get_title() + ' ' + y)
                
                const stripCoverWidget = new St.Widget({
                    reactive: true,
                    can_focus: true,
                    track_hover: true,
                    visible: true
                });
        
                this.dragAndDropSupport = new DragAndDropSupport.DragAndDropSupport(stripCoverWidget);
                this.dragAndDropSupport.makeDraggable();

                stripCoverWidget.set_position(targetMetaWindowRect.x, targetMetaWindowRect.y);
                stripCoverWidget.height =  targetMetaWindowRect.height;
                stripCoverWidget.style = 'background-color : rgb(246,211,45)';
                stripCoverWidget.visible = true;
                stripCoverWidget.opacity = 40;
                Main.uiGroup.add_child(stripCoverWidget);

                // this._idleIdStripCoverWidget = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                //     Main.uiGroup.add_child(stripCoverWidget);
                //     this._idleIdStripCoverWidget = null;
                //     return GLib.SOURCE_REMOVE;
                // });
                
            }
		});

        this._subscribeSignal('WindowPickCancelled', () => {
            // Unsubscribe the PickWindow DBus service, it's really no necessary to keep the subscription all the time
            Gio.DBus.session.signal_unsubscribe(this._dbusConnection);
            this._dbusConnection = null;
        });

    }

    getMetaWindowById(windowId) {
        let targetMetaWindow;
        let windows = global.get_window_actors();
        for (let i = 0; i < windows.length; i++) {
            let metaWindow = windows[i].metaWindow;
            if (MetaWindowUtils.getStableWindowId(metaWindow) === windowId) {
                targetMetaWindow = metaWindow;
                break;
            }
        }
        return targetMetaWindow;
    }

    _subscribeSignal(signalName, callback) {
        const dbusConnection = Gio.DBus.session.signal_subscribe(
            'org.gnome.Shell', 'org.gnome.Shell.Extensions.stripcover.PickWindow', 
            signalName,
            '/org/gnome/shell/extensions/stripcover', null, Gio.DBusSignalFlags.NONE, 
            callback);
        return dbusConnection;
    }

    destroy() {

        if (this.setting_changed_signal_ids.length) {
            this.setting_changed_signal_ids.forEach(id => this.settings.disconnect(id));
            this.setting_changed_signal_ids = [];
        }

        if (this.strip_h) {
            Main.uiGroup.remove_child(this.strip_h);
            this.strip_h.destroy();
            this.strip_h = null;
        }

        if (this.strip_v) {
            Main.uiGroup.remove_child(this.strip_v);
            this.strip_v.destroy();
            this.strip_v = null;
        }

        if (this.dragAndDropSupport) {
            this.dragAndDropSupport = null;
        }
    }

}