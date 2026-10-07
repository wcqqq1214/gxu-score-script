import json
import os
from pathlib import Path
import re
import shutil
import sys
import subprocess
import time

root = Path(__file__).resolve().parents[1]
unit = "gxu-score-verify.service"
unit_file = Path("/run/systemd/system") / unit
group = Path("/sys/fs/cgroup/system.slice") / unit


def command(*args):
    return subprocess.check_output(args, text=True).strip()


def properties():
    return dict(line.split("=", 1) for line in command(
        "systemctl", "show", unit, "-p", "ActiveState", "-p", "Result",
        "-p", "ExecMainStatus", "-p", "MainPID", "-p", "InvocationID"
    ).splitlines())


def identity(pid):
    try:
        return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]
    except FileNotFoundError:
        return None


assert os.geteuid() == 0, "Run as root on a systemd/cgroup-v2 test host"
assert not unit_file.exists(), "Existing verification unit must not be overwritten"
results = []
directories = set()
try:
    for mode, deadline, freeze in [
        ("success", 60, False),
        ("login-failure", 90, False),
        ("request-timeout", 65, False),
        ("hang", 20, False),
        ("hard-hang", 20, True),
    ]:
        if len(sys.argv) > 1 and mode != sys.argv[1]:
            continue
        content = (root / "deploy/gxu-score.service").read_text()
        content = re.sub(r"^WorkingDirectory=.*", f"WorkingDirectory={root}", content, flags=re.M)
        content = re.sub(r"^ExecStart=.*", f"ExecStart=/usr/bin/node --import tsx/esm tests/fixture.mjs {mode}", content, flags=re.M)
        content = content.replace("TimeoutStartSec=10min", f"TimeoutStartSec={deadline}s")
        unit_file.write_text(content)
        subprocess.run(["systemctl", "daemon-reload"], check=True)
        subprocess.run(["systemctl", "reset-failed", unit], stderr=subprocess.DEVNULL)
        subprocess.run(["systemctl", "start", "--no-block", unit], check=True)
        started = time.monotonic()
        peak_memory = peak_tasks = 0
        seen = {}
        duplicated = False
        invocation = ""
        while time.monotonic() - started < deadline + 25:
            state = properties()
            invocation = state["InvocationID"] or invocation
            pids = []
            if group.exists():
                try:
                    peak_memory = max(peak_memory, int((group / "memory.current").read_text()))
                    peak_tasks = max(peak_tasks, int((group / "pids.current").read_text()))
                    pids = [int(p) for p in (group / "cgroup.procs").read_text().split()]
                    seen.update({p: identity(p) for p in pids})
                except FileNotFoundError:
                    pass
            if state["MainPID"] != "0" and not duplicated:
                subprocess.run(["systemctl", "start", "--no-block", unit], check=True)
                after = properties()
                assert after["MainPID"] == state["MainPID"]
                assert after["InvocationID"] == state["InvocationID"]
                duplicated = True
            if state["ActiveState"] in ("inactive", "failed"):
                break
            time.sleep(0.2)
        else:
            raise AssertionError("Service exceeded timeout plus cleanup allowance")
        logs = command("journalctl", f"_SYSTEMD_INVOCATION_ID={invocation}", "--no-pager", "-o", "cat")
        directories.update(re.findall(r"FIXTURE_DIRECTORY=(/tmp/gxu-lifecycle-[\w-]+)", logs))
        time.sleep(0.5)
        leftovers = [p for p, start in seen.items() if start is not None and identity(p) == start]
        assert not leftovers, f"Remaining task processes: {leftovers}"
        assert not group.exists() or not (group / "cgroup.procs").read_text().strip()
        assert duplicated
        if mode == "success":
            assert state["Result"] == "success" and state["ExecMainStatus"] == "0", logs
            assert "reason=success" in logs and "FIXTURE_BROWSER_CLOSED" in logs, logs
        elif mode == "login-failure":
            assert state["ExecMainStatus"] == "1", logs
            assert logs.count("FIXTURE_BROWSER_OPEN") == 3, logs
            assert logs.count("FIXTURE_BROWSER_CLOSED") == 3, logs
            assert "retries=2" in logs, logs
        elif mode == "request-timeout":
            assert state["ExecMainStatus"] == "1", logs
            assert "TimeoutError" in logs and "FIXTURE_BROWSER_CLOSED" in logs, logs
        else:
            assert state["Result"] == "timeout", logs
            if freeze:
                assert "FIXTURE_EVENT_LOOP_BLOCKED" in logs and state["ExecMainStatus"] == "9", logs
            else:
                assert "SIGTERM" in logs and "FIXTURE_BROWSER_CLOSED" in logs, logs
        result = {
            "mode": mode, "frozen": freeze, "result": state["Result"],
            "exit_status": state["ExecMainStatus"], "duration_s": round(time.monotonic() - started, 1),
            "sampled_peak_mib": round(peak_memory / 1024**2, 1), "peak_tasks": peak_tasks,
            "no_overlap": duplicated, "remaining_processes": leftovers, "invocation": invocation,
        }
        results.append(result)
        print(json.dumps(result), flush=True)
finally:
    for directory in directories:
        shutil.rmtree(directory, ignore_errors=True)
    subprocess.run(["systemctl", "stop", unit], check=False)
    unit_file.unlink(missing_ok=True)
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    subprocess.run(["systemctl", "reset-failed", unit], stderr=subprocess.DEVNULL)
