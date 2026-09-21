const fs = require('fs');

// Linux converters see runtime libraries + one disposable job directory, never uploads,
// the API source/.env, home directories, sockets, or the host network.
function sandboxCommand(binary, args, directory, platform = process.platform) {
  if (platform !== 'linux') return { binary, args };
  const flags = ['--die-with-parent', '--new-session', '--unshare-all', '--cap-drop', 'ALL'];
  for (const root of ['/usr', '/bin', '/sbin', '/lib', '/lib64']) {
    if (fs.existsSync(root)) flags.push('--ro-bind', root, root);
  }
  for (const entry of ['/etc/fonts', '/etc/ld.so.cache', '/etc/localtime']) {
    if (fs.existsSync(entry)) flags.push('--ro-bind', entry, entry);
  }
  flags.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--bind', directory, directory,
    '--chdir', directory, '--setenv', 'HOME', directory, '--setenv', 'TMPDIR', '/tmp', '--', binary, ...args);
  return { binary: 'bwrap', args: flags };
}
module.exports = { sandboxCommand };
