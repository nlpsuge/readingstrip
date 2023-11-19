/*
  Reading Strip, Reading guide on the computer for people with dyslexia.
  Copyright (C) 2021-22 Luigi Pantano

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
const { St, Clutter, GObject, Meta, Shell, Gio } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const ReadingStrip = Extension.imports.readingStrip;
const WindowPicker = Extension.imports.utils.WindowPicker;

const interval = 1000 / 60;

let indicator, panelButtonIcon;
let readingStrip;
let settings;
let _windowPickerServiceProvider;

// Indicator on panel
const ReadingStripIndicator = GObject.registerClass(
	class ReadingStripIndicator extends PanelMenu.Button {
		_init() {
			super._init(null, 'ReadingStrip');
			const panelButtonIcon_off = Gio.icon_new_for_string(`${Extension.path}/icons/readingstrip-off-symbolic.svg`);
			panelButtonIcon = new St.Icon({
				gicon : panelButtonIcon_off,
				style_class: 'system-status-icon',
				icon_size: '16'
			});

			this.add_actor(panelButtonIcon);
		}
	}
);

function enable() {
	settings = ExtensionUtils.getSettings();

	_windowPickerServiceProvider = new WindowPicker.WindowPickerServiceProvider();
    _windowPickerServiceProvider.enable();

	// add button to top panel
	indicator = new ReadingStripIndicator();
	indicator.connect('button-press-event', () => {
		readingStrip = new ReadingStrip.ReadingStrip(settings, indicator);
		readingStrip.toggleReadingStrip(panelButtonIcon);
	});
	Main.panel.addToStatusArea('ReadingStrip', indicator);

	// sync with current monitor
	// readingStrip.syncStrip(true);
}

function disable() {
	Main.wm.removeKeybinding('hotkey');

	if (indicator) {
		indicator.destroy();
		indicator = null;
	}

	if (readingStrip) {
		readingStrip.destroy();
		readingStrip = null;
	}

	if (settings) {
		settings = null;
	}

	if (_windowPickerServiceProvider) {
        _windowPickerServiceProvider.destroy();
        _windowPickerServiceProvider = null;
    }

}
