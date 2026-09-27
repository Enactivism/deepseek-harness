import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const BUS_NAME = 'ai.deepseek.Harness.Pointer';
const OBJECT_PATH = '/ai/deepseek/Harness/Pointer';
const INTERFACE_NAME = 'ai.deepseek.Harness.Pointer';
const POLL_INTERVAL_MS = 16;

const INTERFACE_XML = `
<node>
  <interface name="${INTERFACE_NAME}">
    <method name="Start" />
    <method name="Stop" />
    <signal name="PointerMoved">
      <arg name="x" type="i" />
      <arg name="y" type="i" />
    </signal>
  </interface>
</node>`;

class PointerService {
    constructor() {
        this._pollSource = 0;
        this._dbus = Gio.DBusExportedObject.wrapJSObject(INTERFACE_XML, this);
    }

    export(connection) {
        this._dbus.export(connection, OBJECT_PATH);
    }

    unexport() {
        this.stop();
        this._dbus.unexport();
    }

    Start() {
        this.start();
    }

    Stop() {
        this.stop();
    }

    start() {
        if (this._pollSource !== 0) return;
        this._pollSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_INTERVAL_MS, () => {
            const [x, y] = global.get_pointer();
            this._dbus.emit_signal('PointerMoved', new GLib.Variant('(ii)', [x, y]));
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._pollSource === 0) return;
        GLib.source_remove(this._pollSource);
        this._pollSource = 0;
    }
}

export default class DeepSeekHarnessPointerExtension {
    enable() {
        this._service = new PointerService();
        this._ownerId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            BUS_NAME,
            Gio.BusNameOwnerFlags.NONE,
            connection => this._service.export(connection),
            null,
            null,
        );
    }

    disable() {
        if (this._ownerId !== 0) {
            Gio.bus_unown_name(this._ownerId);
            this._ownerId = 0;
        }
        this._service?.unexport();
        this._service = null;
    }
}
