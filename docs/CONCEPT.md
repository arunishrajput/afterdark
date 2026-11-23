# Original Concept (verbatim)

> This is the creator's original pitch, kept exactly as written so later sessions can trace intent.
> It is **not** the spec: where it conflicts with [RULES.md](RULES.md), RULES.md wins. Every divergence is
> explained in [DECISIONS.md](DECISIONS.md). A second reference, the INFILTR8 game design document, is
> summarised in [reference/INFILTR8_NOTES.md](reference/INFILTR8_NOTES.md).
>
> Added later by the creator (not in the text below): **Meetings, discussion and voting** must be part of the game.

---

# AfterDark — Game Concept

I want to build a PWA (Progressive Web App) based game called **AfterDark**, inspired by **Among Us**, but as a **real-life GPS-based game**.

It will include physical activities like running, and the players will appear as dots on the map. Players must move to different locations on the map to complete tasks. It is somewhat similar to **https://shadowhunt.fun/** for reference.

## Game Flow

The game will have a **lobby code system** where a new lobby can be created and joined using the lobby code.

- Approx. **8 people per lobby**
- The host can set a **game boundary** or draw a **virtual boundary** on the actual map so that players stay inside the range; otherwise, they will lose points.
- The host can set game configurations like:
  - play time
  - playable area
  - and other game settings

Every player must enter a **username** before joining.

The concept is:

1. Everyone joins the lobby.
2. Everyone presses **Ready**.
3. The game starts.

At first, everyone will be shown a **different spot on the map** on their phone, and each spot will be far from the others.

Each player will go to their assigned location. When all players reach their locations:

- they will get a **unique in-game character name** that no other players will know
- **2 players** will randomly receive the **imposter role**
- only those 2 players will know they are imposters
- everyone except the imposters will see all players as normal and the same

The imposter theme will be **red**, and the normal player theme will be **blue**.

---

## Imposter Abilities

The imposter can do 3 things:

### 1. Infection
The imposter can come near other players (**3 m radius**) and stay in that radius for **10 seconds**.

- The normal player will get infected after **1 minute** after the imposter leaves them.
- Infected players can be seen only by imposters.
- No one, even the infected member, will know that they are infected.
- There will be **n number of boxes** according to the number of members in the game at the top of the screen.
- When 1 person gets infected, 1 box will show it as infected so that everyone knows someone from the team got infected.
- As players get infected by the imposter, the box will turn into an infected box so that other players can know that the imposter is doing their work well and they should complete their tasks faster.

If more than **50% of the normal players** get infected before they reach the task completion score target, the **imposters win**.

### 2. Task Stopping
Imposters can stop tasks.

- The imposter will get a special button after some cooldown time.
- When the imposter clicks that button:
  - work-in-progress tasks get reset
  - no one can do any tasks for **10 seconds**

### 3. Fake Tasks
Imposters can also create fake tasks.

- This is also a cooldown-time-based special button.
- When clicked, the imposter can pin anywhere on the map.
- A random fake task will be created there and assigned randomly to any player.
- When that task is completed by any player:
  - they will not get points
  - instead, they will get a funny message on the screen:
    **“you got fooled by a fake taskl”**

### 4. Camouflage
Some tasks will be designed in a way that they require **2 people** and will be assigned to **2 people**.

For example:

- A task will be assigned to **Person A** and **Person B**
- When Person A reaches the location, the task reveals itself
- The player sees that it also needs Person B
- So Person A will go to every other player physically and ask whether they are Person B or not

If the person is really Person B, then both players will go to that location and complete their collaborative task, such as:

- entering a pin from one person to another
- or something similar

But if Person A comes to an imposter and asks whether they are Person B or not, the imposter has the option to click the **Camouflage** button (cooldown timer based).

- This turns their screen to the normal theme
- The imposter can lie and say they are Person B
- Then both of them will go to that location
- The imposter can also complete any collaborative task without letting the other person know whether they were really Person B or an imposter

While telling the lie and completing the collaborative task, if the imposter manages to stay within Person A’s range for **10 seconds**, Person A will also get infected.

---

## Normal Player System

The normal players will get different points for completing different types of tasks.

At a time, **1 player** should be assigned **3 unique tasks**.

- Some tasks may be collaborative
- Some tasks may be solo tasks
- It is random

As soon as one task is completed by the player:

- they will get assigned **one new task**
- so they again have **3 options** to go to and do their task

The task will only be revealed **when the player reaches the location**.

The new task assignment could be:

- a real task
- or a fake task if the imposter clicks the fake task generation button

The player who gets assigned a new task after completing one may receive a fake task. When they reach the location and reveal the task, then complete it, they will get the funny fake task message with **no points**.

The tasks are **infinite**, so players keep doing one task after another and collect as many points as fast as they can to reach the task completion target score.

If normal players collectively collect **100 points** before getting half of them infected, then they win the game.

---

## Task Types

The tasks will be like:

- Connecting matching wires
- Normal puzzle
- Small crossword
- Break the lock
- Key pickup from one location and unlock a lock at another location
- etc.

Based on difficulty and time, tasks will have different points.

---

## Goal

The game should be:

- smooth
- not conflicting with any rules
- fully valid
- and fair
