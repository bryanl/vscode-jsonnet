import * as cmd from './cmd';
import { FS } from './fs';
import { Host } from './host';
import { Shell } from './shell';

export interface Jsonnet extends cmd.Cmd { };

class JsonnetImpl extends cmd.BaseCmd {
    constructor(host: Host, fs: FS, shell: Shell, ksFound: boolean) {
        const bin = host.getConfiguration('jsonnet')['jsonnetExecutable'];
        super(host, fs, shell, bin, 'jsonnet', ksFound);
    }
}

export function create(host: Host, fs: FS, shell: Shell): cmd.Cmd {
    return new JsonnetImpl(host, fs, shell, false);
}
