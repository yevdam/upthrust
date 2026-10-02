# UPTHRUST

A zero-dependency HTML5 canvas game about flying a rocket through an increasingly hostile, infinite asteroid field.

## Run

Open `index.html` directly, or serve the folder locally:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Controls

- Hold `Space` to thrust
- Hold `A` / `D` or `Left` / `Right` to steer
- Press `R` to relaunch after a crash
- Touch controls appear on narrow screens

Forcefields last 15 seconds. Hitting an asteroid while protected destroys the field instead of the rocket.
