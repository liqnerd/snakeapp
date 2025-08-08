import sys
import os
import json
import random
import colorsys
from dataclasses import dataclass

import pygame


# ----------------------------
# Game configuration
# ----------------------------
GRID_SIZE = 32  # 32x32 grid
WINDOW_SIZE = 1200  # requested desktop window size
CELL_SIZE = WINDOW_SIZE // GRID_SIZE  # pixels per cell
BOARD_PIXELS = CELL_SIZE * GRID_SIZE
BOARD_OFFSET = (WINDOW_SIZE - BOARD_PIXELS) // 2  # center the board
FPS = 12  # base tick rate (logic paced separately)
SCORES_FILE = os.path.join(os.path.dirname(__file__), "scores.json")

# Colors
BLACK = (10, 10, 10)
DARK = (18, 18, 18)
WHITE = (240, 240, 240)
SNAKE_COLOR = (60, 205, 120)
SNAKE_HEAD_COLOR = (40, 180, 100)
GRID_COLOR = (30, 30, 30)
FRUIT_COLORS = [
    (235, 64, 52),   # red
    (255, 165, 0),   # orange
    (255, 215, 0),   # gold
    (186, 85, 211),  # plum
    (30, 144, 255),  # dodger blue
]


@dataclass
class Point:
    x: int
    y: int


class Snake:
    def __init__(self, start: Point):
        self.direction = Point(1, 0)  # moving right initially
        self.pending_direction = self.direction
        # Start with length 3 in the center
        self.body: list[Point] = [
            Point(start.x - 2, start.y),
            Point(start.x - 1, start.y),
            Point(start.x, start.y),
        ]
        self.growth_pending: int = 0

    @property
    def head(self) -> Point:
        return self.body[-1]

    def set_direction(self, dx: int, dy: int):
        # Prevent reversing into itself
        new_dir = Point(dx, dy)
        if len(self.body) > 1:
            if new_dir.x == -self.direction.x and new_dir.y == -self.direction.y:
                return
        self.pending_direction = new_dir

    def step(self):
        # Commit direction at the start of tick
        self.direction = self.pending_direction
        new_head = Point(self.head.x + self.direction.x, self.head.y + self.direction.y)
        # Wrap around
        new_head.x %= GRID_SIZE
        new_head.y %= GRID_SIZE

        self.body.append(new_head)
        if self.growth_pending > 0:
            self.growth_pending -= 1
        else:
            self.body.pop(0)

    def hits_self(self) -> bool:
        head = self.head
        # Any segment except the last (which is the head)
        return any(seg.x == head.x and seg.y == head.y for seg in self.body[:-1])


class Game:
    def __init__(self):
        self.grid_size = GRID_SIZE
        self.cell_size = CELL_SIZE
        self.score = 0
        center = Point(self.grid_size // 2, self.grid_size // 2)
        self.snake = Snake(center)
        # fruit system
        self.fruit = self._random_free_cell()
        self.fruit_color = (235, 64, 52)
        self.fruit_points = 1
        self.fruit_name = "Apple"
        # special fruit (2x2 at center)
        self.special_active = False
        self.special_cells: list[Point] = []
        self.special_points = 10
        self.special_spawned_at_ms: int | None = None
        self.special_duration_ms = 5000
        self.special_spawn_chance = 0.01  # rarer per step
        self.snake_glow_until_ms: int = 0
        self.game_over = False
        # initialize first fruit
        self._roll_new_normal_fruit()

        # timing for movement
        self.base_step_interval_ms = int(1000 / FPS)
        self.last_step_ms = pygame.time.get_ticks()

        # TURBO system
        self.turbo_active = False
        self.turbo_duration_ms = 1200
        self.turbo_cooldown_ms = 12000  # 3x longer cooldown
        self.turbo_last_used_ms: int = -1000000

    def _random_free_cell(self) -> Point:
        occupied = {(p.x, p.y) for p in self.snake.body}
        while True:
            x = random.randrange(0, self.grid_size)
            y = random.randrange(0, self.grid_size)
            if (x, y) not in occupied:
                return Point(x, y)

    def _roll_new_normal_fruit(self):
        # Weighted fruit types (rarer fruits give more points)
        fruit_types = [
            {"name": "Apple", "color": (235, 64, 52), "points": 1, "weight": 50},
            {"name": "Orange", "color": (255, 165, 0), "points": 2, "weight": 30},
            {"name": "Banana", "color": (255, 215, 0), "points": 3, "weight": 15},
            {"name": "Berry", "color": (186, 85, 211), "points": 4, "weight": 4},
            {"name": "Starfruit", "color": (30, 144, 255), "points": 5, "weight": 1},
        ]
        weights = [f["weight"] for f in fruit_types]
        choice = random.choices(fruit_types, weights=weights, k=1)[0]
        self.fruit = self._random_free_cell()
        self.fruit_color = choice["color"]
        self.fruit_points = choice["points"]
        self.fruit_name = choice["name"]

    def _maybe_spawn_special(self):
        if self.special_active:
            return
        # 2x2 centered block
        cx = self.grid_size // 2 - 1
        cy = self.grid_size // 2 - 1
        cells = [
            Point(cx, cy),
            Point(cx + 1, cy),
            Point(cx, cy + 1),
            Point(cx + 1, cy + 1),
        ]
        snake_cells = {(p.x, p.y) for p in self.snake.body}
        if any((c.x, c.y) in snake_cells for c in cells):
            # If snake is occupying center, skip this time
            return
        self.special_cells = cells
        self.special_active = True
        self.special_spawned_at_ms = pygame.time.get_ticks()

    def update(self, now_ms: int):
        if self.game_over:
            return

        # Handle turbo end
        if self.turbo_active and (now_ms - self.turbo_last_used_ms >= self.turbo_duration_ms):
            self.turbo_active = False

        # Movement pacing
        speed_multiplier = 0.45 if self.turbo_active else 1.0
        interval = int(self.base_step_interval_ms * speed_multiplier)
        did_step = False
        if now_ms - self.last_step_ms >= interval:
            self.last_step_ms = now_ms
            # Move snake
            self.snake.step()
            did_step = True

        # Self collision
        if self.snake.hits_self():
            self.game_over = True
            return

        head = self.snake.head

        # Maybe spawn special fruit at any time (only evaluate on steps)
        if did_step and not self.special_active and random.random() < self.special_spawn_chance:
            self._maybe_spawn_special()

        # Expire special fruit after duration
        if self.special_active and self.special_spawned_at_ms is not None:
            if pygame.time.get_ticks() - self.special_spawned_at_ms >= self.special_duration_ms:
                self.special_active = False
                self.special_cells = []
                self.special_spawned_at_ms = None

        # Check special fruit first
        if self.special_active and did_step:
            if any(head.x == c.x and head.y == c.y for c in self.special_cells):
                self.score += self.special_points
                self.snake.growth_pending += self.special_points
                self.special_active = False
                self.special_cells = []
                # Snake glow for 2s after eating special
                self.snake_glow_until_ms = now_ms + 2000
                # After special, roll a new normal fruit
                self._roll_new_normal_fruit()
                return

        # Check normal fruit
        if did_step and head.x == self.fruit.x and head.y == self.fruit.y:
            self.score += self.fruit_points
            self.snake.growth_pending += self.fruit_points
            # Roll next normal fruit
            self._roll_new_normal_fruit()

    def draw(self, surface: pygame.Surface, font: pygame.font.Font):
        surface.fill(DARK)

        # Optional subtle grid (centered)
        for i in range(self.grid_size + 1):
            x = BOARD_OFFSET + i * self.cell_size
            y = BOARD_OFFSET + i * self.cell_size
            pygame.draw.line(surface, GRID_COLOR, (x, BOARD_OFFSET), (x, BOARD_OFFSET + BOARD_PIXELS), 1)
            pygame.draw.line(surface, GRID_COLOR, (BOARD_OFFSET, y), (BOARD_OFFSET + BOARD_PIXELS, y), 1)

        # Draw normal fruit (only if visible)
        if 0 <= self.fruit.x < self.grid_size and 0 <= self.fruit.y < self.grid_size:
            fx = BOARD_OFFSET + self.fruit.x * self.cell_size
            fy = BOARD_OFFSET + self.fruit.y * self.cell_size
            fruit_rect = pygame.Rect(fx + 2, fy + 2, self.cell_size - 4, self.cell_size - 4)
            pygame.draw.rect(surface, self.fruit_color, fruit_rect, border_radius=4)

        # Draw special fruit (2x2) with rainbow glow
        if self.special_active:
            t = pygame.time.get_ticks() / 1000.0
            hue = (t * 0.5) % 1.0
            r, g, b = colorsys.hsv_to_rgb(hue, 1.0, 1.0)
            base_color = (int(r * 255), int(g * 255), int(b * 255))

            # Glow layer
            glow_surface = pygame.Surface((WINDOW_SIZE, WINDOW_SIZE), pygame.SRCALPHA)
            for c in self.special_cells:
                cx = BOARD_OFFSET + c.x * self.cell_size
                cy = BOARD_OFFSET + c.y * self.cell_size
                for expand, alpha in ((6, 60), (3, 100)):
                    rect = pygame.Rect(cx + 1 - expand, cy + 1 - expand,
                                       self.cell_size - 2 + expand * 2,
                                       self.cell_size - 2 + expand * 2)
                    glow_col = (base_color[0], base_color[1], base_color[2], alpha)
                    pygame.draw.rect(glow_surface, glow_col, rect, border_radius=10)
            surface.blit(glow_surface, (0, 0))

            # Core cells
            for c in self.special_cells:
                cx = BOARD_OFFSET + c.x * self.cell_size
                cy = BOARD_OFFSET + c.y * self.cell_size
                rect = pygame.Rect(cx + 1, cy + 1, self.cell_size - 2, self.cell_size - 2)
                pygame.draw.rect(surface, base_color, rect, border_radius=5)

        # Snake glow if active (after special fruit)
        now_ms = pygame.time.get_ticks()
        if now_ms < self.snake_glow_until_ms:
            glow_hue = ((now_ms / 1000.0) * 1.0) % 1.0
            gr, gg, gb = colorsys.hsv_to_rgb(glow_hue, 1.0, 1.0)
            glow_color = (int(gr * 255), int(gg * 255), int(gb * 255), 80)
            glow_surface = pygame.Surface((WINDOW_SIZE, WINDOW_SIZE), pygame.SRCALPHA)
            for seg in self.snake.body:
                px = BOARD_OFFSET + seg.x * self.cell_size
                py = BOARD_OFFSET + seg.y * self.cell_size
                rect = pygame.Rect(px - 4, py - 4, self.cell_size + 8, self.cell_size + 8)
                pygame.draw.rect(glow_surface, glow_color, rect, border_radius=12)
            surface.blit(glow_surface, (0, 0))

        # Draw snake
        for idx, seg in enumerate(self.snake.body):
            px = BOARD_OFFSET + seg.x * self.cell_size
            py = BOARD_OFFSET + seg.y * self.cell_size
            rect = pygame.Rect(px + 1, py + 1, self.cell_size - 2, self.cell_size - 2)
            color = SNAKE_HEAD_COLOR if idx == len(self.snake.body) - 1 else SNAKE_COLOR
            pygame.draw.rect(surface, color, rect, border_radius=5)

        # Score
        score_surf = font.render(f"Score: {self.score}", True, WHITE)
        surface.blit(score_surf, (10, 8))

        # Turbo UI (top-right)
        bar_w, bar_h = 160, 14
        margin = 10
        x = WINDOW_SIZE - bar_w - margin
        y = margin
        pygame.draw.rect(surface, (60, 60, 60), pygame.Rect(x, y, bar_w, bar_h), border_radius=6)

        now_ms = pygame.time.get_ticks()
        if self.turbo_active:
            # Show duration remaining
            elapsed = now_ms - self.turbo_last_used_ms
            ratio = max(0.0, 1.0 - (elapsed / self.turbo_duration_ms))
            fill_w = int(bar_w * ratio)
            pygame.draw.rect(surface, (255, 100, 80), pygame.Rect(x, y, fill_w, bar_h), border_radius=6)
        else:
            since = now_ms - self.turbo_last_used_ms
            ratio = min(1.0, since / self.turbo_cooldown_ms) if self.turbo_last_used_ms > 0 else 1.0
            color = (90, 200, 120) if ratio >= 1.0 else (120, 170, 255)
            fill_w = int(bar_w * ratio)
            pygame.draw.rect(surface, color, pygame.Rect(x, y, fill_w, bar_h), border_radius=6)
        label = font.render("TURBO", True, WHITE)
        surface.blit(label, (x - 90, y - 2))

        # Game over overlay
        if self.game_over:
            overlay = pygame.Surface((WINDOW_SIZE, WINDOW_SIZE), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 140))
            surface.blit(overlay, (0, 0))
            big_font = pygame.font.Font(None, 48)
            msg = big_font.render("Game Over", True, WHITE)
            sub = font.render("Press R to restart", True, WHITE)
            rect = msg.get_rect(center=(WINDOW_SIZE // 2, WINDOW_SIZE // 2 - 10))
            surface.blit(msg, rect)
            sub_rect = sub.get_rect(center=(WINDOW_SIZE // 2, WINDOW_SIZE // 2 + 24))
            surface.blit(sub, sub_rect)


def load_scores() -> list[int]:
    try:
        if "emscripten" in sys.platform:
            try:
                import js  # type: ignore
                data_str = js.window.localStorage.getItem("snake_scores")
                if data_str is None:
                    return []
                data = json.loads(str(data_str))
                if isinstance(data, list):
                    return sorted({int(x) for x in data}, reverse=True)
            except Exception:
                return []
        else:
            with open(SCORES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    # Deduplicate while preserving highest unique scores only
                    unique = sorted({int(x) for x in data}, reverse=True)
                    return unique
    except FileNotFoundError:
        return []
    except Exception:
        return []
    return []


def save_score(score: int):
    # Merge and keep only unique scores, top 100
    scores = load_scores()
    scores.append(int(score))
    unique_sorted = sorted({int(x) for x in scores}, reverse=True)[:100]
    try:
        if "emscripten" in sys.platform:
            import js  # type: ignore
            js.window.localStorage.setItem("snake_scores", json.dumps(unique_sorted))
        else:
            with open(SCORES_FILE, "w", encoding="utf-8") as f:
                json.dump(unique_sorted, f)
    except Exception:
        pass


def draw_menu(surface: pygame.Surface, font: pygame.font.Font, big_font: pygame.font.Font, menu_index: int, options: list[str]):
    surface.fill(DARK)
    title = big_font.render("Snake 32x32", True, WHITE)
    title_rect = title.get_rect(center=(WINDOW_SIZE // 2, WINDOW_SIZE // 2 - 240))
    surface.blit(title, title_rect)

    for i, text in enumerate(options):
        selected = (i == menu_index)
        color = WHITE if selected else (180, 180, 180)
        label = font.render(text, True, color)
        rect = label.get_rect(center=(WINDOW_SIZE // 2, WINDOW_SIZE // 2 - 60 + i * 60))
        surface.blit(label, rect)


def draw_leaderboard(surface: pygame.Surface, font: pygame.font.Font, big_font: pygame.font.Font):
    surface.fill(DARK)
    title = big_font.render("Leaderboard", True, WHITE)
    surface.blit(title, (WINDOW_SIZE // 2 - title.get_width() // 2, 60))

    scores = sorted(load_scores(), reverse=True)[:15]
    if not scores:
        msg = font.render("No scores yet", True, (200, 200, 200))
        surface.blit(msg, (WINDOW_SIZE // 2 - msg.get_width() // 2, WINDOW_SIZE // 2))
    else:
        y = 140
        for idx, s in enumerate(scores, start=1):
            line = font.render(f"{idx:2}. {s}", True, WHITE)
            surface.blit(line, (WINDOW_SIZE // 2 - 80, y))
            y += 30

    hint = font.render("Press Esc or Backspace to return", True, (200, 200, 200))
    surface.blit(hint, (WINDOW_SIZE // 2 - hint.get_width() // 2, WINDOW_SIZE - 50))


def draw_fruits_info(surface: pygame.Surface, font: pygame.font.Font, big_font: pygame.font.Font):
    surface.fill(DARK)
    title = big_font.render("Fruits", True, WHITE)
    surface.blit(title, (WINDOW_SIZE // 2 - title.get_width() // 2, 40))

    fruit_types = [
        ("Apple", (235, 64, 52), 1),
        ("Orange", (255, 165, 0), 2),
        ("Banana", (255, 215, 0), 3),
        ("Berry", (186, 85, 211), 4),
        ("Starfruit", (30, 144, 255), 5),
    ]

    start_y = 130
    for i, (name, color, points) in enumerate(fruit_types):
        y = start_y + i * 50
        rect = pygame.Rect(120, y, 28, 28)
        pygame.draw.rect(surface, color, rect, border_radius=6)
        label = font.render(f"{name}  +{points}", True, WHITE)
        surface.blit(label, (170, y + 4))

    # Special fruit (2x2)
    y = start_y + len(fruit_types) * 50 + 20
    # draw a 2x2 block
    cell = 16
    base_x = 120
    base_y = y
    for dx in (0, 1):
        for dy in (0, 1):
            rect = pygame.Rect(base_x + dx * (cell + 2), base_y + dy * (cell + 2), cell, cell)
            pygame.draw.rect(surface, (255, 100, 100), rect, border_radius=4)
    label = font.render("Mega Fruit (2x2 center)  +10", True, WHITE)
    surface.blit(label, (170, y + 6))

    hint = font.render("Press Esc or Backspace to return", True, (200, 200, 200))
    surface.blit(hint, (WINDOW_SIZE // 2 - hint.get_width() // 2, WINDOW_SIZE - 50))


def main():
    pygame.init()
    pygame.display.set_caption("Snake 32x32")
    if "emscripten" in sys.platform:
        # Auto-fit to browser canvas for pygbag
        screen = pygame.display.set_mode((0, 0), pygame.SCALED)
    else:
        screen = pygame.display.set_mode((WINDOW_SIZE, WINDOW_SIZE))
    clock = pygame.time.Clock()
    # Use default font to avoid missing font issues on the web
    font = pygame.font.Font(None, 28)
    big_font = pygame.font.Font(None, 48)

    # Game states
    STATE_MENU = "menu"
    STATE_PLAY = "play"
    STATE_LEADER = "leader"
    STATE_FRUITS = "fruits"

    state = STATE_MENU
    menu_options = ["Start Game", "Leaderboard", "Fruits", "Exit Game"]
    menu_index = 0
    game = Game()

    running = True
    while running:
        now_ms = pygame.time.get_ticks()
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if state == STATE_MENU:
                    if event.key in (pygame.K_UP, pygame.K_w):
                        menu_index = (menu_index - 1) % len(menu_options)
                    elif event.key in (pygame.K_DOWN, pygame.K_s):
                        menu_index = (menu_index + 1) % len(menu_options)
                    elif event.key in (pygame.K_RETURN, pygame.K_SPACE):
                        choice = menu_options[menu_index]
                        if choice == "Start Game":
                            game = Game()
                            state = STATE_PLAY
                        elif choice == "Leaderboard":
                            state = STATE_LEADER
                        elif choice == "Fruits":
                            state = STATE_FRUITS
                        elif choice == "Exit Game":
                            running = False
                    elif event.key in (pygame.K_ESCAPE,):
                        running = False

                elif state == STATE_PLAY:
                    if event.key in (pygame.K_ESCAPE,):
                        # Return to menu
                        state = STATE_MENU
                    elif event.key in (pygame.K_w,):
                        game.snake.set_direction(0, -1)
                    elif event.key in (pygame.K_s,):
                        game.snake.set_direction(0, 1)
                    elif event.key in (pygame.K_a,):
                        game.snake.set_direction(-1, 0)
                    elif event.key in (pygame.K_d,):
                        game.snake.set_direction(1, 0)
                    elif event.key == pygame.K_LSHIFT:
                        # Activate TURBO if off cooldown
                        if not game.turbo_active and (now_ms - game.turbo_last_used_ms >= game.turbo_cooldown_ms):
                            game.turbo_active = True
                            game.turbo_last_used_ms = now_ms
                    elif event.key in (pygame.K_r,) and game.game_over:
                        # Save score on game over when restarting
                        save_score(game.score)
                        game = Game()
                    elif event.key in (pygame.K_RETURN,) and game.game_over:
                        # Save and return to menu
                        save_score(game.score)
                        state = STATE_MENU

                elif state == STATE_LEADER:
                    if event.key in (pygame.K_ESCAPE, pygame.K_BACKSPACE):
                        state = STATE_MENU

                elif state == STATE_FRUITS:
                    if event.key in (pygame.K_ESCAPE, pygame.K_BACKSPACE):
                        state = STATE_MENU

        # Update and draw
        try:
            if state == STATE_MENU:
                draw_menu(screen, font, big_font, menu_index, menu_options)
            elif state == STATE_PLAY:
                prev_over = game.game_over
                game.update(now_ms)
                if game.game_over and not prev_over:
                    # Save score once when game transitions to over
                    save_score(game.score)
                game.draw(screen, font)
            elif state == STATE_LEADER:
                draw_leaderboard(screen, font, big_font)
            elif state == STATE_FRUITS:
                draw_fruits_info(screen, font, big_font)
        except Exception as e:
            # Render error to screen so web users don't see black screen
            msg = f"Error: {type(e).__name__}: {e}"
            print(msg)
            screen.fill((0, 0, 0))
            err_font = pygame.font.Font(None, 28)
            # Wrap error text
            y = 40
            for line in [msg[i:i+60] for i in range(0, len(msg), 60)][:10]:
                surf = err_font.render(line, True, (255, 80, 80))
                screen.blit(surf, (20, y))
                y += 30

        pygame.display.flip()
        clock.tick(FPS)

    pygame.quit()
    sys.exit(0)


if __name__ == "__main__":
    main()


