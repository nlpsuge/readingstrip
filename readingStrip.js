const { St, Meta, Shell, Clutter, Gio, GLib, Cogl, GObject } = imports.gi;

const Main = imports.ui.main;
const DND = imports.ui.dnd;
const Screenshot = imports.ui.screenshot;

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

            let chosenMetaWindow = this.getMetaWindowById(windowId);
            if (chosenMetaWindow) {
                const chosenMetaWindowRect = chosenMetaWindow.get_frame_rect();
                log('chosenMetaWindowRect.x ' + chosenMetaWindowRect.x)
                log('chosenMetaWindowRect.y ' + chosenMetaWindowRect.y)
                log('chosenMetaWindowRect.width ' + chosenMetaWindowRect.width)
                log('chosenMetaWindowRect.height ' + chosenMetaWindowRect.height)
                const originalX = chosenMetaWindowRect.x;
                const originalY = chosenMetaWindowRect.y;// + Math.round(chosenMetaWindowRect.height * 0.8);
                const originalWidth = chosenMetaWindowRect.width;
                const originalHeight = chosenMetaWindowRect.height;

                log(chosenMetaWindow.get_title() + ' ' + originalY)
                
                const layout = new St.BoxLayout({
                    reactive: true,
                    can_focus: true,
                    track_hover: true,
                    visible: true,
                    vertical: false,
                });
                
                const stripCoverWidget = new St.Widget({
                    reactive: true,
                    can_focus: true,
                    track_hover: true,
                    visible: true
                });

                layout.add(stripCoverWidget);
        
                this.dragAndDropSupport = new DragAndDropSupport.DragAndDropSupport(layout);
                this.dragAndDropSupport.makeDraggable();                

                const layoutHeight = 35;
                const layoutMarginFromBottom = 96;
                // layout.style = 'background-color : rgb(246,211,45)';
                layout.x = originalX;
                // layout.y = originalY + (originalHeight - layoutHeight - layoutMarginFromBottom);
                layout.y = originalY;
                // layout.height = layoutHeight;
                layout.height = originalHeight;
                layout.width = originalWidth;
                layout.opacity = 100;

                Main.uiGroup.add_child(layout);

                const windowCloneWidget = this._getWindowCloneWidget(chosenMetaWindow);
                // windowCloneWidget.set_clip(
                //     layout.x,
                //     layout.y,
                //     // 0, 0,
                //     layout.width,
                //     layout.height,
                // );
                // windowCloneWidget.set_clip_to_allocation(true);
                // windowCloneWidget.set_position(originalX, originalY);
                windowCloneWidget.set_size(originalHeight, originalWidth);
                

                log('windowCloneWidget.height ' + windowCloneWidget.height);
                log('windowCloneWidget.width ' + windowCloneWidget.width);
                log('windowCloneWidget.x ' + windowCloneWidget.x);
                log('windowCloneWidget.y ' + windowCloneWidget.y);

                layout.add(windowCloneWidget);
                
                log('this.strip_h.style ' + stripCoverWidget.style);
                log('this.strip_h.opacity ' + stripCoverWidget.opacity);
                log('this.strip_h.visible ' + stripCoverWidget.visible);
                log('this.strip_h.height ' + stripCoverWidget.height);
                log('this.strip_h.width ' + stripCoverWidget.width);
                log('this.strip_h.x ' + stripCoverWidget.x);
                log('this.strip_h.y ' + stripCoverWidget.y);
                log('layout_h.visible ' + layout.visible);
                log('stripCoverWidget.get_parent() ' + stripCoverWidget.get_parent());
                log('layout_h.get_parent() ' + layout.get_parent());
                
            }
		});

        this._subscribeSignal('WindowPickCancelled', () => {
            // Unsubscribe the PickWindow DBus service, it's really no necessary to keep the subscription all the time
            Gio.DBus.session.signal_unsubscribe(this._dbusConnection);
            this._dbusConnection = null;
        });

    }

    /**
     * This function is adapted from https://github.com/home-sweet-gnome/dash-to-panel
     */
    _getWindowCloneWidget(window) {
        let frameRect = window.get_frame_rect();
        let bufferRect = window.get_buffer_rect();
        let clone = new Clutter.Clone({ source: window.get_compositor_private() });
        let cloneWidget = new St.Widget({
            opacity: 100,
            layout_manager: 
                            // frameRect.width != bufferRect.width || 
                            // frameRect.height != bufferRect.height ?
                            new WindowCloneLayout(frameRect, bufferRect)
                            // :
                            // new Clutter.BinLayout()
        });
        
        cloneWidget.add_child(clone);

        return cloneWidget;
    }

    async _takeScreenshot(window, widget) {
        try {
            const actor = window.get_compositor_private();
            const content = actor.paint_to_content(null);
            const texture = content.get_texture();

            // Screenshot.captureScreenshot(texture, null, 1, null);

            const scale = 1;
            const stream = Gio.MemoryOutputStream.new_resizable();
            const [x, y, w, h] = [0, 0, -1, -1];
            const cursor = { texture: null, x: 0, y: 0, scale: 1 };

            global.display.get_sound_player().play_from_theme(
                'screen-capture', _('Screenshot taken'), null);

            const pixbuf = await Shell.Screenshot.composite_to_stream(
                texture,
                x, y, w, h,
                scale,
                cursor.texture, cursor.x, cursor.y, cursor.scale,
                stream
            );

            stream.close(null);

            const imageBytes = stream.steal_as_bytes();
            
            

            // Apply the mosaic effect
            const mosaicSize = 10;
            for (let mosaicX = 0; mosaicX < pixbuf.width; mosaicX += mosaicSize) {
                for (let mosaicY = 0; mosaicY < pixbuf.height; mosaicY += mosaicSize) {
                    const color = pixbuf.get_pixels().slice(
                        (mosaicY * pixbuf.rowstride) + (mosaicX * pixbuf.n_channels),
                        (mosaicY * pixbuf.rowstride) + ((mosaicX + mosaicSize) * pixbuf.n_channels)
                    );

                    // Get the first pixel value to fill with
                    const pixelValue = color[0];

                    // Fill the mosaic block with the pixel value
                    pixbuf.fill(pixelValue);
                }
            }

            const pixels = pixbuf.read_pixel_bytes();
            const imageContent =
                St.ImageContent.new_with_preferred_size(pixbuf.width, pixbuf.height);
            imageContent.set_bytes(
                pixels,
                Cogl.PixelFormat.RGBA_8888,
                pixbuf.width,
                pixbuf.height,
                pixbuf.rowstride
            );

            // Create a Clutter image from the Pixbuf
            // const imageMosaic = new Clutter.Image();
            // imageMosaic.set_data(pixbuf.get_pixels(), pixbuf.get_colorspace(), true, pixbuf.width, pixbuf.height, pixbuf.rowstride);

            // const stTexture = St.TextureCache.get_default().create();
            // // const stTexture = new St.Texture({ width: 1, height: 1, reactive: true });
            // stTexture.set_data(imageMosaic.get_cogl_texture(), pixbuf.width, pixbuf.height);

            const bytes = imageContent.get_bytes();
            const clutterBytes = new Clutter.Bytes({ data: bytes });
            const clutterImage = Clutter.Image.new();
            clutterImage.set_from_bytes(clutterBytes);

            widget.add_child(clutterImage);

            // _storeScreenshot(stream.steal_as_bytes(), pixbuf);
            
        } catch (e) {
            logError(e, 'Error capturing screenshot');
        }
    }

    getMetaWindowById(windowId) {
        let chosenMetaWindow;
        let windows = global.get_window_actors();
        for (let i = 0; i < windows.length; i++) {
            let metaWindow = windows[i].metaWindow;
            if (MetaWindowUtils.getStableWindowId(metaWindow) === windowId) {
                chosenMetaWindow = metaWindow;
                break;
            }
        }
        return chosenMetaWindow;
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

var WindowCloneLayout = GObject.registerClass({
}, class WindowCloneLayout extends Clutter.BinLayout {

    _init(frameRect, bufferRect) {
        super._init();

        //the buffer_rect contains the transparent padding that must be removed
        this.frameRect = frameRect;
        this.bufferRect = bufferRect;
    }

    vfunc_allocate(actor, box) {
        let [width, height] = box.get_size();

        log('this.bufferRect.x ' + this.bufferRect.x)
        log('this.bufferRect.y ' + this.bufferRect.y)
        log('this.frameRect.x ' + this.frameRect.x)
        log('this.frameRect.y ' + this.frameRect.y)
        // log('this.ratio ' + this.ratio)
        // log('this.padding[0] ' + this.padding[0])
        // log('this.padding[1] ' + this.padding[1])

        box.set_origin(
            (this.bufferRect.x - this.frameRect.x),// * this.ratio + this.padding[0], 
            (this.bufferRect.y - this.frameRect.y)// * this.ratio + this.padding[1]
        );

        box.set_size(
            width + (this.bufferRect.width - this.frameRect.width),// * this.ratio, 
            height + (this.bufferRect.height - this.frameRect.height)// * this.ratio
        );

        actor.get_first_child().allocate(box);
    }
});