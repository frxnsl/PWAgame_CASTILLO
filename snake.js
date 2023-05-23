/*
This game is based on [Lessmilk Game: Dark Blue](http://www.lessmilk.com/game/dark-blue/).

A whole game consists of multiple levels that the player must complete. 
A level is completed when all coins have been collected. 
If the player touches lava, the current level is restored to its starting position, 
and the player may try again.

A simple plan example:

```js
var simpleLevelPlan = [
  "                      ",
  "                      ",
  "  x              = x  ",
  "  x         o o    x  ",
  "  x @      xxxxx   x  ",
  "  xxxxx            x  ",
  "      x!!!!!!!!!!!!x  ",
  "      xxxxxxxxxxxxxx  ",
  "                      "
];
```

1. `@` is where the player starts
2. `o` is a coin
3. `x` is a piece of walls
4. space is for empty space
5. `!` is fixed lava
6. `=` is lava moving horizontally
7. `|` is lava moving vertically
8. `v` is dripping lava(does not bounce back but jump back to start position 
   when it hits the floor)
*/

"use strict";

/*
 ============================
 Helper funtions & classes
 ============================
*/
/* Provide a short way to create an element and give it a class */
function elt(name, className) {
  var elt = document.createElement(name);
  if (className) elt.className = className;
  return elt;
}

/* Vector */
function Vector(x, y) {
  this.x = x;
  this.y = y;
}

Vector.prototype.plus = function(other) {
  return new Vector(this.x + other.x, this.y + other.y);
};

Vector.prototype.times = function(factor) {
  return new Vector(this.x * factor, this.y * factor);
};

/* 
Level Object

Read a level. For brevity, the code does not check for malformed input.

---
Properties:
grid: an array of arrays with 
  1. each of the inner arrays represents a horizontal line;
  2. each square containt either `null`(empty squares), or a string indicating the type(`wall` or `lava`)
  
actors: an array of objects that track the current position and state of the dynamic elements
  Each of the Actor object is expected to have properties:
  1. `pos` that gives it position (the coordinates of its top-left corner)
  2. `size` that gives its size
  3. `type` that holds a string identifying the element
  
player: the player Actor object

status: whether the player has won or not

finishDelay: when the player wins or loses, it is used to keep the level active for a short period
*/
function Level(plan) {
  this.width = plan[0].length;
  this.height = plan.length;
  this.grid = [];
  this.actors = [];

  // build the grid
  for (var y = 0; y < this.height; y++) {
    var line = plan[y],
      gridLine = [];
    for (var x = 0; x < this.width; x++) {
      var ch = line[x],
        fieldType = null;
      var Actor = actorChars[ch];
      if (Actor)
        this.actors.push(new Actor(new Vector(x, y), ch));
      else if (ch == "x")
        fieldType = "wall";
      else if (ch == "!")
        fieldType = "lava";
      gridLine.push(fieldType);
    }
    this.grid.push(gridLine);
  }

  // store the player Actor object
  this.player = this.actors.filter(function(actor) {
    return actor.type == "player";
  })[0];
  this.status = this.finishDelay = null;
}

// To find out whether a level is finished
Level.prototype.isFinished = function() {
  return this.status != null && this.finishDelay < 0;
}

/*
We’ll take a more modest approach on dealing with the interactions between the elements, 
handling only collisions between rectangular objects and handling them in a rather simplistic
way.

*Before* moving the player or a block of lava, we test whether the motion would take it inside of
a nonempty part of the background. If it does, we simply cancel the motion altogether. 
The response to such a collision depends on the type of actor—the player will stop, whereas a
lava block will bounce back.

Collisions between the player and other dynamic actors (coins, moving lava) are handled *after* 
the player moved.
*/
// To tell whether a rectangle (specified by a position and a size) 
// overlaps with any nonempty space on the background grid
Level.prototype.obstacleAt = function(pos, size) {
  // Compute the set of grid squares that *contains* the player
  var xStart = Math.floor(pos.x);
  var xEnd = Math.ceil(pos.x + size.x);
  var yStart = Math.floor(pos.y);
  var yEnd = Math.ceil(pos.y + size.y);

  // If the body sticks out of the level, we always return "wall" for the sides and top
  if (xStart < 0 || xEnd > this.width || yStart < 0)
    return "wall";
  // and "lava" for the bottom
  if (yEnd > this.height)
    return "lava";
  for (var y = yStart; y < yEnd; y++) {
    for (var x = xStart; x < xEnd; x++) {
      var fieldType = this.grid[y][x];
      if (fieldType) return fieldType;
    }
  }
}

// Handle the collisions between the player and other dynamic actors.
Level.prototype.actorAt = function(actor) {
  for (var i = 0; i < this.actors.length; i++) {
    var other = this.actors[i];
    if (other != actor &&
      actor.pos.x + actor.size.x > other.pos.x &&
      actor.pos.x < other.pos.x + other.size.x &&
      actor.pos.y + actor.size.y > other.pos.y &&
      actor.pos.y < other.pos.y + other.size.y)
      return other;
  }
};

var maxStep = 0.05;
// Gives all actors in the level a chance to move.
// `step`: the time step in seconds
// `keys`: contains the info about the arrow keys pressed
Level.prototype.animate = function(step, keys) {
  if (this.status != null) {
    this.finishDelay -= step;
  }

  // cut the time step into suitably small pieces, ensuring that step is not to large
  while (step > 0) {
    var thisStep = Math.min(step, maxStep);
    this.actors.forEach(function(actor) {
      actor.act(thisStep, this, keys);
    }, this);
    step -= thisStep;
  }
};

// Handles collisions between the player and other objects
Level.prototype.playerTouched = function(type, actor) {
  if (type == "lava" && this.status == null) {
    this.status = "lost";
    this.finishDelay = 1;
  } else if (type == "coin") {
    this.actors = this.actors.filter(function(other) {
      return other != actor;
    });
    if (!this.actors.some(function(actor) {
        return actor.type == "coin";
      })) {
      this.status = "won";
      this.finishDelay = 1;
    }
  }
};

/* actorChars object used to associate characters with constructor functions */
var actorChars = {
  "@": Player,
  "o": Coin,
  "=": Lava,
  "|": Lava,
  "v": Lava
};

/*
 ============================
 Actor objects
 ============================
 Actor objects have an `act` method, which takes as arguments the time step, the level object,
 and the keys object.
*/

/* 
Player object

Player motion is handled separately per axis because hitting the floor should not prevent
horizontal motion, and hitting a wall should not stop falling or jumping motion.
When the player dies (touches lava), we set up a little animation that causes them to 
“shrink” or “sink” down by reducing the height of the player object.

Properties:
speed: current speed
*/
function Player(pos) {
  // Because a player is 1.5 squares high, its initial position is set to be 0.5 square above the position where the @ character appeared. 
  // This way, its bottom aligns with the bottom of the square it appeared in.
  this.pos = pos.plus(new Vector(0, -0.5));
  this.size = new Vector(0.8, 1.5);
  this.speed = new Vector(0, 0);
}

Player.prototype.type = "player";

// Horizontal motion
var playerXSpeed = 7;
Player.prototype.moveX = function(step, level, keys) {
  this.speed.x = 0;
  if (keys.left) this.speed.x -= playerXSpeed;
  if (keys.right) this.speed.x += playerXSpeed;

  var motion = new Vector(this.speed.x * step, 0);
  var newPos = this.pos.plus(motion);
  var obstacle = level.obstacleAt(newPos, this.size);
  if (obstacle)
  // When a motion causes the player to hit something, the level’s `playerTouched` method, 
  // which handles things like dying in lava and collecting coins, is called. 
    level.playerTouched(obstacle);
  else
  // Otherwise, the object updates its position.
    this.pos = newPos;
};

// Vertival motion
// The gravity, jumping speed, and pretty much all other constants 
// in this game have been set by trial and error.
var gravity = 30;
var jumpSpeed = 17;
Player.prototype.moveY = function(step, level, keys) {
  this.speed.y += step * gravity;
  var motion = new Vector(0, this.speed.y * step);
  var newPos = this.pos.plus(motion);
  var obstacle = level.obstacleAt(newPos, this.size);
  if (obstacle) {
    level.playerTouched(obstacle);
    if (keys.up && this.speed.y > 0)
      this.speed.y = -jumpSpeed;
    else
      this.speed.y = 0;
  } else {
    this.pos = newPos;
  }
};

Player.prototype.act = function(step, level, keys) {
  this.moveX(step, level, keys);
  this.moveY(step, level, keys);

  var otherActor = level.actorAt(this);
  if (otherActor)
    level.playerTouched(otherActor.type, otherActor);

  // Losing animation
  if (level.status == "lost") {
    this.pos.y += step;
    this.size.y -= step;
  }
};

/*
Lava object

We need to initialize this object differently depending on the character it is based on. 
Dynamic lava moves along at its given speed until it hits an obstacle. At that point, 
- if it has a `repeatPos` property, it will jump back to its start position (dripping). 
- If it does not, it will invert its speed and continue in the other direction (bouncing).
*/
function Lava(pos, ch) {
  this.pos = pos;
  this.size = new Vector(1, 1);
  if (ch == "=") {
    this.speed = new Vector(2, 0);
  } else if (ch == "|") {
    this.speed = new Vector(0, 2);
  } else if (ch == "v") {
    this.speed = new Vector(0, 3);
    this.repeatPos = pos;
  }
}

Lava.prototype.type = "lava";

Lava.prototype.act = function(step, level) {
  var newPos = this.pos.plus(this.speed.times(step));
  if (!level.obstacleAt(newPos, this.size))
    this.pos = newPos;
  else if (this.repeatPos)
  // Dripping lava has a repeatPos property, to which it jumps back when it hits something
    this.pos = this.repeatPos;
  else
  // Bouncing lava simply inverts its speed
    this.speed = this.speed.times(-1);
};

/*
Coin object

Coins mostly just sit in their place. But to liven up the game a little, they are given a “wobble”, a slight vertical motion back and forth.

Properties:
wobble: the randomized starting phase of sin's wave
*/
function Coin(pos) {
  // `basePos` and `wobble` together determine the actual position.

  this.basePos = this.pos = pos.plus(new Vector(0.2, 0.1));
  this.size = new Vector(0.6, 0.6);
  // To avoid a situation where all coins move up and down synchronously, 
  // the starting phase of each coin is randomized.
  this.wobble = Math.random() * Math.PI * 2;
}

Coin.prototype.type = "coin";

var wobbleSpeed = 8,
  wobbleDist = 0.07;
// Coins ignore collisions since they are simply wobbling around inside of their own square, 
// and collisions with the player will be handled by the player's `act` method.
Coin.prototype.act = function(step) {
  // The `wobble` property is updated to track time and then used as an argument to Math.sin 
  // to create a wave
  this.wobble += step * wobbleSpeed;
  var wobblePos = Math.sin(this.wobble) * wobbleDist;
  this.pos = this.basePos.plus(new Vector(0, wobblePos));
};

/*
DOMDisplay object

A display object displays a given level, encapsulating of the drawing code.
This `DOMDisplay` object uses simple DOM elements to show the level.

It is created by giving it a parent element to which it should append itself and 
a level object.
*/
function DOMDisplay(parent, level) {
  // `appendChild` returns the appended element to create the wrapper element
  this.wrap = parent.appendChild(elt("div", "game"));
  this.level = level;

  // The level’s background, which never changes, is drawn once.
  this.wrap.appendChild(this.drawBackground());
  // The actors are redrawn every time the display is updated. 
  // The `actorLayer` property will be used by `drawFrame` to track the element that holds 
  // the actors so that they can be easily removed and replaced.
  this.actorLayer = null;
  this.drawFrame();
}

// When setting pixel sizes, we will have to scale these coordinates up—everything in the game would be ridiculously small at a single pixel per square.
var scale = 20;

// The background is drawn as a `<table>` element. This nicely corresponds to the structure 
// of the grid property in the level—
// each row of the grid is turned into a table row (`<tr>` element). 
// The strings in the grid are used as class names for the table cell (`<td>`) elements.
DOMDisplay.prototype.drawBackground = function() {
  var table = elt("table", "background");
  table.style.width = this.level.width * scale + "px";
  this.level.grid.forEach(function(row) {
    var rowElt = table.appendChild(elt("tr"));
    rowElt.style.height = scale + "px";
    row.forEach(function(type) {
      rowElt.appendChild(elt("td", type));
    });
  });
  return table;
};

// We draw each actor by creating a DOM element for it and setting that element’s position 
// and size based on the actor’s properties. 
// The values have to be multiplied by scale to go from game units to pixels.
DOMDisplay.prototype.drawActors = function() {
  var wrap = elt("div");
  this.level.actors.forEach(function(actor) {
    var rect = wrap.appendChild(elt("div",
      "actor " + actor.type));
    rect.style.width = actor.size.x * scale + "px";
    rect.style.height = actor.size.y * scale + "px";
    rect.style.left = actor.pos.x * scale + "px";
    rect.style.top = actor.pos.y * scale + "px";
  });
  return wrap;
};

// When it updates the display, the `drawFrame` method first removes the old actor graphics, 
// if any, and then redraws them in their new positions.
// Since there will typically be only a handful of actors in the game, redrawing all of 
// them is not expensive.
DOMDisplay.prototype.drawFrame = function() {
  if (this.actorLayer)
    this.wrap.removeChild(this.actorLayer);
  this.actorLayer = this.wrap.appendChild(this.drawActors());
  // By adding the level’s current status as a class name to the wrapper, 
  // we can style the player actor slightly differently when the game is won or lost
  this.wrap.className = "game " + (this.level.status || "");
  this.scrollPlayerIntoView();
};

// We can’t assume that levels always fit in the viewport. 
// That is why the `scrollPlayerIntoView` call is needed—
// it ensures that if the level is protruding outside the viewport, 
// we scroll that viewport to make sure the player is near its center.
// In this method, we find the player’s position and update the wrapping element’s 
// scroll position.
DOMDisplay.prototype.scrollPlayerIntoView = function() {
  var width = this.wrap.clientWidth;
  var height = this.wrap.clientHeight;
  var margin = width / 3;

  // The viewport
  var left = this.wrap.scrollLeft,
    right = left + width;
  var top = this.wrap.scrollTop,
    bottom = top + height;

  var player = this.level.player;
  // To find the actor’s center, we add its position (its top-left corner) and half its size. 
  // That is the center in level coordinates, but we need it in pixel coordinates, 
  // so we then multiply the resulting vector by our display scale.
  var center = player.pos.plus(player.size.times(0.5)).times(scale);

  // Note that sometimes this will set nonsense scroll coordinates, 
  // below zero or beyond the element’s scrollable area. 
  // This is okay—the DOM will constrain them to sane values. 
  // Setting scrollLeft to -10 will cause it to become 0.
  if (center.x < left + margin)
    this.wrap.scrollLeft = center.x - margin;
  else if (center.x > right - margin)
    this.wrap.scrollLeft = center.x + margin - width;

  if (center.y < top + margin)
    this.wrap.scrollTop = center.y - margin;
  else if (center.y > bottom - margin)
    this.wrap.scrollTop = center.y + margin - height;
};

// To clear a displayed level, to be used when the game moves to the next level or resets a level.
DOMDisplay.prototype.clear = function() {
  this.wrap.parentNode.removeChild(this.wrap);
};

/*
 ============================
 Key tracking
 ============================
 For a game like this, we do not want keys to take effect once per keypress. Rather, we want  
 their effect (moving the player figure) to continue happening as long as they are pressed.
*/
var arrowCodes = {
  37: "left",
  38: "up",
  39: "right",
};

// Track the current position of keys.
function trackKeys(codes) {
  var pressed = Object.create(null);

  function handler(event) {
    if (codes.hasOwnProperty(event.keyCode)) {
      var down = event.type == "keydown";
      pressed[codes[event.keyCode]] = down;
      event.preventDefault();
    }
  }
  addEventListener("keydown", handler);
  addEventListener("keyup", handler);

  pressed.unregister = function() {
    removeEventListener("keydown", handler);
    removeEventListener("keyup", handler);
  }

  return pressed;
}

/*
 ============================
 Animation
 ============================
 */
// The `requestAnimationFrame` function provides a good way to animate a game. 
// But its interface is quite primitive—using it requires us to track the time at which 
// our function was called the last time around and call `requestAnimationFrame` again 
// after every frame.
// Let’s define a helper function that wraps those boring parts in a convenient interface and 
// allows us to simply call `runAnimation`, giving it a function that expects a time difference 
// as an argument and draws a single frame.
function runAnimation(frameFunc) {
  var lastTime = null;

  function frame(time) {
    var stop = false;
    if (lastTime != null) {
      // Set a maximum frame step of 100 milliseconds.
      // When the browser tab or window with our page is hidden, `requestAnimationFrame` calls 
      // will be suspended until the tab or window is shown again. 
      // In this case, the difference between `lastTime` and `time` will be the entire time 
      // in which the page was hidden. Advancing the game by that much in a single step 
      // will look silly and might be a lot of work (remember the time-splitting in 
      // the `animate` method).
      var timeStep = Math.min(time - lastTime, 100) / 1000; // convert to seconds
      stop = frameFunc(timeStep) == false;
    }
    lastTime = time;
    if (!stop)
      requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// The runLevel function takes a Level object, a constructor for a display, 
// and, optionally, a function.
// It displays the level (in `document.body`) and lets the user play through it.
// When the level is finished (lost or won), `runLevel` clears the display, stops the animation.
// and, if an `andThen` function was given, calls that function with the level’s status.
// Pausing feature is added. You can press ESC to pause the game.
function runLevel(level, Display, andThen) {
  var display = new Display(document.body, level);
  var running = "yes";

  // Listener for pause key
  function handleEscKey(event) {
    if (event.keyCode == 27) { // ESC's key code is 27
      var handler = arrows.eventListener;
      if (running == "yes") {
        running = "pausing";
      } else if (running == "no") { // resume
        running = "yes";
        runAnimation(animation);
      } else if (running == "pausing") { // not yet stop animation
        running = "yes";
      }
    }
  }
  addEventListener("keydown", handleEscKey);
  var arrows = trackKeys(arrowCodes);

  function animation(step) {
    if (running == "pausing") {
      running = "no";
      // When the game is paused, level will not respond to the change of 
      // arrow keys so we do not need to unregister arrow keys' listeners.
      return false; // actually pause the game
    }

    level.animate(step, arrows);
    display.drawFrame(step);
    if (level.isFinished()) {
      display.clear();
      removeEventListener("keydown", handleEscKey);
      arrows.unregister();
      if (andThen)
        andThen(level.status);
      return false;
    }
  }

  runAnimation(animation);
}

// A game is a sequence of levels. Whenever the player dies, the current level is restarted. 
// When a level is completed, we move on to the next level. 
// This can be expressed by the following function, which takes an array of level plans 
// (arrays of strings) and a display constructor.
// Player has 3 lives for a whole run. When player loses, the game will restart.
function runGame(plans, Display) {
  function startLevel(n, lives) {
    runLevel(new Level(plans[n]), Display, function(status) {
      if (status == "lost") {
        if (lives > 0) {
          startLevel(n, lives - 1);
        } else {
          console.log('Game Over!');
          startLevel(0, 3);
        }
      } else if (n < plans.length - 1)
        startLevel(n + 1);
      else
        console.log("You win!");
    });
  }
  startLevel(0, 3);
}

// test
var GAME_LEVELS = [
  ["                                                                                ",
    "                                                                                ",
    "                                                                                ",
    "                                                                                ",
    "                                                                                ",
    "                                                                                ",
    "                                                                  xxx           ",
    "                                                   xx      xx    xx!xx          ",
    "                                    o o      xx                  x!!!x          ",
    "                                                                 xx!xx          ",
    "                                   xxxxx                          xvx           ",
    "                                   |                                        xx  ",
    "  xx                                      o o                                x  ",
    "  x                     o                                                    x  ",
    "  x                                      xxxxx                             o x  ",
    "  x          xxxx       o                                                    x  ",
    "  x  @       x  x                                                xxxxx     = x  ",
    "  xxxxxxxxxxxx  xxxxxxxxxxxxxxx   xxxxxxxxxxxxxxxxxxxx     xxxxxxx   xxxxxxxxx  ",
    "                              x   x                  x     x                    ",
    "                              x!!!x                  x!!!!!x                    ",
    "                              x!!!x                  x!!!!!x                    ",
    "                              xxxxx                  xxxxxxx                    ",
    "                                                                                ",
    "                                                                                "
  ],
  ["                                      x!!x                        xxxxxxx                                    x!x  ",
    "                                      x!!x                     xxxx     xxxx                                 x!x  ",
    "                                      x!!xxxxxxxxxx           xx           xx                                x!x  ",
    "                                      xx!!!!!!!!!!xx         xx             xx                               x!x  ",
    "                                       xxxxxxxxxx!!x         x                                    o   o   o  x!x  ",
    "                                                xx!x         x     o   o                                    xx!x  ",
    "                                                 x!x         x                                xxxxxxxxxxxxxxx!!x  ",
    "                                                 xvx         x     x   x                        !!!!!!!!!!!!!!xx  ",
    "                                                             xx  |   |   |  xx            xxxxxxxxxxxxxxxxxxxxx   ",
    "                                                              xx!!!!!!!!!!!xx            v                        ",
    "                                                               xxxx!!!!!xxxx                                      ",
    "                                               x     x            xxxxxxx        xxx         xxx                  ",
    "                                               x     x                           x x         x x                  ",
    "                                               x     x                             x         x                    ",
    "                                               x     x                             xx        x                    ",
    "                                               xx    x                             x         x                    ",
    "                                               x     x      o  o     x   x         x         x                    ",
    "               xxxxxxx        xxx   xxx        x     x               x   x         x         x                    ",
    "              xx     xx         x   x          x     x     xxxxxx    x   x   xxxxxxxxx       x                    ",
    "             xx       xx        x o x          x    xx               x   x   x               x                    ",
    "     @       x         x        x   x          x     x               x   x   x               x                    ",
    "    xxx      x         x        x   x          x     x               x   xxxxx   xxxxxx      x                    ",
    "    x x      x         x       xx o xx         x     x               x     o     x x         x                    ",
    "!!!!x x!!!!!!x         x!!!!!!xx     xx!!!!!!!!xx    x!!!!!!!!!!     x     =     x x         x                    ",
    "!!!!x x!!!!!!x         x!!!!!xx       xxxxxxxxxx     x!!!!!!!xx!     xxxxxxxxxxxxx xx  o o  xx                    ",
    "!!!!x x!!!!!!x         x!!!!!x    o                 xx!!!!!!xx !                    xx     xx                     ",
    "!!!!x x!!!!!!x         x!!!!!x                     xx!!!!!!xx  !                     xxxxxxx                      ",
    "!!!!x x!!!!!!x         x!!!!!xx       xxxxxxxxxxxxxx!!!!!!xx   !                                                  ",
    "!!!!x x!!!!!!x         x!!!!!!xxxxxxxxx!!!!!!!!!!!!!!!!!!xx    !                                                  ",
    "!!!!x x!!!!!!x         x!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!xx     !                                                  "
  ],
  ["                                                                                                              ",
    "                                                                                                              ",
    "                                                                                                              ",
    "                                                                                                              ",
    "                                                                                                              ",
    "                                        o                                                                     ",
    "                                                                                                              ",
    "                                        x                                                                     ",
    "                                        x                                                                     ",
    "                                        x                                                                     ",
    "                                        x                                                                     ",
    "                                       xxx                                                                    ",
    "                                       x x                 !!!        !!!  xxx                                ",
    "                                       x x                 !x!        !x!                                     ",
    "                                     xxx xxx                x          x                                      ",
    "                                      x   x                 x   oooo   x       xxx                            ",
    "                                      x   x                 x          x      x!!!x                           ",
    "                                      x   x                 xxxxxxxxxxxx       xxx                            ",
    "                                     xx   xx      x   x      x                                                ",
    "                                      x   xxxxxxxxx   xxxxxxxx              x x                               ",
    "                                      x   x           x                    x!!!x                              ",
    "                                      x   x           x                     xxx                               ",
    "                                     xx   xx          x                                                       ",
    "                                      x   x= = = =    x            xxx                                        ",
    "                                      x   x           x           x!!!x                                       ",
    "                                      x   x    = = = =x     o      xxx       xxx                              ",
    "                                     xx   xx          x                     x!!!x                             ",
    "                              o   o   x   x           x     x                xxv        xxx                   ",
    "                                      x   x           x              x                 x!!!x                  ",
    "                             xxx xxx xxx xxx     o o  x!!!!!!!!!!!!!!x                   vx                   ",
    "                             x xxx x x xxx x          x!!!!!!!!!!!!!!x                                        ",
    "                             x             x   xxxxxxxxxxxxxxxxxxxxxxx                                        ",
    "                             xx           xx                                         xxx                      ",
    "  xxx                         x     x     x                                         x!!!x                xxx  ",
    "  x x                         x    xxx    x                                          xxx                 x x  ",
    "  x                           x    xxx    xxxxxxx                        xxxxx                             x  ",
    "  x                           x           x                              x   x                             x  ",
    "  x                           xx          x                              x x x                             x  ",
    "  x                                       x       |xxxx|    |xxxx|     xxx xxx                             x  ",
    "  x                xxx             o o    x                              x         xxx                     x  ",
    "  x               xxxxx       xx          x                             xxx       x!!!x          x         x  ",
    "  x               oxxxo       x    xxx    x                             x x        xxx          xxx        x  ",
    "  x                xxx        xxxxxxxxxxxxx  x oo x    x oo x    x oo  xx xx                    xxx        x  ",
    "  x      @          x         x           x!!x    x!!!!x    x!!!!x    xx   xx                    x         x  ",
    "  xxxxxxxxxxxxxxxxxxxxxxxxxxxxx           xxxxxxxxxxxxxxxxxxxxxxxxxxxxx     xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  ",
    "                                                                                                              ",
    "                                                                                                              "
  ],
  ["                                                                                                  xxx x       ",
    "                                                                                                      x       ",
    "                                                                                                  xxxxx       ",
    "                                                                                                  x           ",
    "                                                                                                  x xxx       ",
    "                          o                                                                       x x x       ",
    "                                                                                             o o oxxx x       ",
    "                   xxx                                                                                x       ",
    "       !  o  !                                                xxxxx xxxxx xxxxx xxxxx xxxxx xxxxx xxxxx       ",
    "       x     x                                                x   x x   x x   x x   x x   x x   x x           ",
    "       x= o  x            x                                   xxx x xxx x xxx x xxx x xxx x xxx x xxxxx       ",
    "       x     x                                                  x x   x x   x x   x x   x x   x x     x       ",
    "       !  o  !            o                                  xxxx xxxxx xxxxx xxxxx xxxxx xxxxx xxxxxxx       ",
    "                                                                                                              ",
    "          o              xxx                              xx                                                  ",
    "                                                                                                              ",
    "                                                                                                              ",
    "                                                      xx                                                      ",
    "                   xxx         xxx                                                                            ",
    "                                                                                                              ",
    "                          o                                                     x      x                      ",
    "                                                          xx     xx                                           ",
    "             xxx         xxx         xxx                                 x                  x                 ",
    "                                                                                                              ",
    "                                                                 ||                                           ",
    "  xxxxxxxxxxx                                                                                                 ",
    "  x         x o xxxxxxxxx o xxxxxxxxx o xx                                                x                   ",
    "  x         x   x       x   x       x   x                 ||                  x     x                         ",
    "  x  @      xxxxx   o   xxxxx   o   xxxxx                                                                     ",
    "  xxxxxxx                                     xxxxx       xx     xx     xxx                                   ",
    "        x=                  =                =x   x                     xxx                                   ",
    "        xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   x!!!!!!!!!!!!!!!!!!!!!xxx!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    "                                                  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "                                                                                                              "
  ]
];
runGame(GAME_LEVELS, DOMDisplay);