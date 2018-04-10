import * as cmd from './cmd';
import { FS } from './fs';
import { Host } from './host';
import { Shell } from './shell';

export interface Ks extends cmd.Cmd { };

class KsImpl extends cmd.BaseCmd {
    constructor(host: Host, fs: FS, shell: Shell, ksFound: boolean) {
        const bin = host.getConfiguration('jsonnet')['ksonnetExecutable'];
        super(host, fs, shell, bin, 'ks', ksFound);
    }
}

export function create(host: Host, fs: FS, shell: Shell): Ks {
    return new KsImpl(host, fs, shell, false);
}
