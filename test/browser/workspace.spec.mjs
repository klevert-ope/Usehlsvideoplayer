import { expect, test } from "@playwright/test";

const button = (page, name) => page.getByRole("button", { name, exact: true });

for (const [device, width, height, touch] of [
  ["small mobile", 320, 568, true],
  ["mobile", 375, 667, true],
  ["landscape mobile", 667, 375, true],
  ["tablet", 768, 1024, true],
  ["desktop", 1440, 900, false],
]) {
  test.describe(device, () => {
    test.use({ viewport: { width, height }, hasTouch: touch });

    test("settings, inspection and source switching work within the player", async ({
      page,
    }) => {
      test.setTimeout(45_000);
      const activate = (element) => (touch ? element.tap() : element.click());
      const outside = () =>
        touch ? page.touchscreen.tap(2, 2) : page.mouse.click(2, 2);
      const status = page.getByTestId("status");
      await page.goto("/");
      await expect(status).toHaveText("ready");
      await expect(page.locator("video")).toHaveJSProperty("controls", false);
      if (touch) await activate(button(page, "play"));
      else await page.getByRole("region", { name: "video player" }).press("k");
      await expect(status).toHaveText("playing");
      if (!touch) await activate(button(page, "unmute"));

      await activate(button(page, "Settings"));
      const settings = page.getByRole("dialog", { name: "Settings" });
      await expect(button(page, "Close Settings")).toBeFocused();
      const box = await settings.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      await settings
        .getByRole("combobox", { name: "Playback speed" })
        .selectOption("1.5");
      await expect(page.locator("video")).toHaveJSProperty("playbackRate", 1.5);
      if (width <= 576) {
        await expect(settings).toHaveAttribute("aria-modal", "true");
        await button(page, "Close Settings").focus();
        await page.keyboard.press("Shift+Tab");
        await expect
          .poll(() =>
            settings.evaluate((panel) =>
              panel.contains(document.activeElement),
            ),
          )
          .toBe(true);
      }
      if (!touch) {
        await settings
          .getByRole("slider", { name: /volume/i })
          .press("ArrowLeft");
        await expect
          .poll(() => page.locator("video").evaluate((video) => video.volume))
          .toBeLessThan(1);
      }
      await page.keyboard.press("Escape");
      await expect(button(page, "Settings")).toBeFocused();
      await expect(status).toHaveText("playing");

      await activate(button(page, "Inspector"));
      const inspector = page.getByRole(
        width >= 1024 ? "complementary" : "dialog",
        { name: "Inspector" },
      );
      await activate(inspector.getByText("Playback metrics", { exact: true }));
      await expect(
        inspector.getByText("Rebuffers", { exact: true }),
      ).toBeVisible();
      if (width >= 1024) {
        await activate(
          inspector.getByText("All metric values", { exact: true }),
        );
        await expect(inspector.getByTestId("metrics")).toContainText(
          "playingMs",
        );
        await activate(button(page, "pause"));
        await expect(status).toHaveText("paused");
        await expect(inspector.getByTestId("metrics")).toBeVisible();
        await activate(button(page, "Settings"));
        await expect(inspector).toBeVisible();
        await outside();
        await expect(settings).toHaveCount(0);
        await expect(inspector).toBeVisible();
        await activate(button(page, "Close Inspector"));
      } else {
        await outside();
        await expect(inspector).toHaveCount(0);
      }

      const source = page.getByRole("button", { name: /^Source / });
      await activate(source);
      const sourcePanel = page.getByRole("dialog", { name: "Stream source" });
      const url = sourcePanel.getByRole("textbox", { name: "Manifest URL" });
      await expect(url).toBeHidden();
      await activate(
        sourcePanel.getByText("Custom manifest URL", { exact: true }),
      );
      await url.fill("/fixtures/low/index.m3u8");
      await url.press("Enter");
      await expect(source).toBeFocused();
      await expect(source).toHaveAccessibleName(
        "Source Single-rendition fixture",
      );
      await expect(status).toHaveText("ready");

      const playbar = await page.locator(".transport").boundingBox();
      let edge = playbar.x;
      const tolerance = 0.01; // Browser rectangles can round subpixel coordinates.
      for (const control of [button(page, "play"), button(page, "Settings")]) {
        const target = await control.boundingBox();
        expect(target.width).toBeGreaterThanOrEqual(44 - tolerance);
        expect(target.height).toBeGreaterThanOrEqual(44 - tolerance);
        expect(target.x).toBeGreaterThanOrEqual(edge - tolerance);
        expect(target.x + target.width).toBeLessThanOrEqual(
          playbar.x + playbar.width + tolerance,
        );
        edge = target.x + target.width;
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    });
  });
}

test("settings fit above the seek bar at the reported viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 750, height: 855 });
  await page.goto("/");
  await expect(page.getByTestId("status")).toHaveText("ready");
  const trigger = button(page, "Settings");
  await trigger.press("Space");
  const panel = page.getByRole("dialog", { name: "Settings" });
  const body = panel.locator(".panel-body");
  const video = await page.locator(".video-stage").boundingBox();
  const seek = await page.locator(".transport-seek").boundingBox();
  const pictureInPicture = panel.getByRole("button", {
    name: /enter picture in picture mode/i,
  });

  if (await pictureInPicture.isVisible()) await pictureInPicture.hover();

  for (const expanded of [false, true]) {
    if (expanded) await panel.getByText("Quality options").click();
    const box = await panel.boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(video.y);
    expect(box.y + box.height).toBeLessThan(seek.y);
    expect(await body.evaluate((element) => element.scrollWidth)).toBe(
      await body.evaluate((element) => element.clientWidth),
    );
    if (!expanded) {
      expect(await body.evaluate((element) => element.scrollHeight)).toBe(
        await body.evaluate((element) => element.clientHeight),
      );
    }
  }

  const volume = panel.getByRole("slider", { name: /volume/i });
  await volume.scrollIntoViewIfNeeded();
  await expect(volume).toBeInViewport({ ratio: 0.95 });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test.describe("live source on a narrow player", () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });

  test("switches from VOD to live and keeps the live action reachable", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("status")).toHaveText("ready");
    const source = page.getByRole("button", { name: /^Source / });
    await source.tap();
    await button(page, "Live fixture").tap();
    await expect(source).toHaveAccessibleName("Source Live fixture");
    const seekLive = button(page, "Seek to live");
    await expect(seekLive).toBeVisible();
    await button(page, "play").tap();
    await expect(seekLive).toBeEnabled();
    await expect(page.getByTestId("status")).toHaveText("playing");
    await seekLive.tap();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
  });
});

test("fullscreen keeps player settings, the playlist and inspector operable", async ({
  page,
}) => {
  await page.goto("/?playlist");
  const video = page.locator("video");
  const fullscreen = () => page.evaluate(() => document.fullscreenElement?.id);
  await button(page, "enter fullscreen mode").click();
  await expect.poll(fullscreen).toBe("output-monitor");

  const settings = button(page, "Settings");
  await settings.press("Space");
  const panel = page.getByRole("dialog", { name: "Settings" });
  await expect(panel).toBeVisible();
  await panel
    .getByRole("combobox", { name: "Playback speed" })
    .selectOption("1.25");
  await expect(video).toHaveJSProperty("playbackRate", 1.25);
  await button(page, "Close Settings").click();
  await expect(settings).toBeFocused();

  const playlist = page.getByRole("button", { name: /^Playlist / });
  await playlist.press("Space");
  await page.getByRole("radio", { name: /CMAF video/ }).check();
  await expect(video).toHaveAttribute("aria-label", "CMAF video");
  await button(page, "Close Playlist").click();
  await expect(playlist).toBeFocused();
  await button(page, "Previous clip").press("Space");
  await expect(video).toHaveAttribute(
    "aria-label",
    "Alternate audio and captions",
  );
  await button(page, "Next clip").press("Space");
  await expect(video).toHaveAttribute("aria-label", "CMAF video");

  await button(page, "Inspector").click();
  await expect(page.getByText("/fixtures/cmaf/index.m3u8")).toBeVisible();
  await button(page, "Close Inspector").click();
  await button(page, "exit fullscreen mode").click();
  await expect.poll(fullscreen).toBeUndefined();
});
