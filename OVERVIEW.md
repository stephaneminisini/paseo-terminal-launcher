# Terminal Launcher

Terminal Launcher saves groups of bash scripts and opens each script in its own terminal tab of the
current workspace with one action. Use it to start every service or worker a project needs, such as
all the steps of a backend pipeline, instead of opening and typing into terminals one by one. The
tabs live on the daemon machine, so any Paseo client connected to it, including your phone, sees
the same running terminals.

## Running a group

- From the Command Center, pick **Run terminal group: <name>**, **Stop terminal group: <name>**, or
  **Run terminal script: <group> / <script>**.
- In the message composer, type `/term <group>` or `/term <script>`, and `/term stop <group>` to
  close them. Use `/term <group> / <script>` when two groups have a script with the same name.

Each script opens an interactive bash shell named after the script and types the script into it one
line at a time. Bash stays open when the script ends or you press Ctrl+C, so the output stays on
screen and the commands are in the shell history for a rerun.

Running a group again closes the open terminals in that workspace that carry the same names and
starts them fresh. Stopping a group closes those terminals. Terminals you opened yourself are left
alone unless they share a script's name.

## Settings

Edit groups under **Settings > Plugins > Terminal Launcher**, or with **Edit terminal groups** in
the Command Center. Each group has a name, an optional folder, and an ordered list of scripts. The
folder is a path on the daemon machine; it can start with `~/`. Leave it empty to start in the
workspace folder. The settings are shared by every client of the daemon.

A first install comes with a **QAI backend** group that starts the QAI pipeline step workers from
`~/dev-fps/qai/apps/backend`. Edit or delete it.

## Limits

- Requires Paseo 0.15.0 or later and `bash` on the daemon machine.
- The Command Center list loads when the plugin starts and after you save settings on that client.
  Use **Refresh terminal groups** on another client to pick up changes made elsewhere.
- Scripts run as your user with your shell environment. Plugins are trusted code: this plugin starts
  processes and types commands into terminals on the daemon machine.
