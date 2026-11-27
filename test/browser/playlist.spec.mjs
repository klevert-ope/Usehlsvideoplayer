import { expect, test } from "@playwright/test";

async function presentFrame(video, seconds) {
  const mediaTime = await video.evaluate(async (element, time) => {
    element.muted = true;
    element.currentTime = time;
    await element.play();
    return new Promise((resolve) => {
      element.requestVideoFrameCallback((_now, frame) => {
        element.pause();
        resolve(frame.mediaTime);
      });
    });
  }, seconds);
  expect(mediaTime).toBeGreaterThanOrEqual(seconds - 0.25);
  expect(mediaTime).toBeLessThan(seconds + 1);
}

test("the VOD playlist plays, selects captions by keyboard and restores each video's saved position", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("hls-playground:position:cmaf", "99999");
  });
  await page.goto("/");
  await page.getByRole("link", { name: "VOD playlist" }).click();
  const video = page.locator("video");
  const firstClip = page.getByRole("radio", {
    name: /Alternate audio and captions/,
  });
  const secondClip = page.getByRole("radio", { name: /CMAF video/ });
  const captions = page.getByRole("combobox", {
    name: "Captions",
    exact: true,
  });
  const save = page.getByRole("button", { name: "Save position" });
  const restart = page.getByRole("button", { name: "Start over" });
  const status = page.getByTestId("playlist-notice");
  const time = () => video.evaluate((element) => element.currentTime);

  await expect(video).toHaveJSProperty("controls", false);
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  const playlist = page.getByRole("button", { name: /^Playlist / });
  await playlist.press("Enter");
  await page.keyboard.press("Tab");
  await expect(firstClip).toBeFocused();
  await expect(page.locator("label.clip").filter({ has: firstClip })).toHaveCSS(
    "outline-style",
    "solid",
  );
  await expect(restart).toBeEnabled();
  await presentFrame(video, 4);
  await page.keyboard.press("Escape");
  await settings.press("Enter");
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("combobox", { name: "Audio", exact: true }).press("Tab");
  await expect(captions).toBeFocused();
  await expect(captions).toBeEnabled();
  await captions.press("End");
  await expect(captions).toBeFocused();
  await expect
    .poll(() =>
      video.evaluate((element) =>
        Array.from(element.textTracks).some(
          (track) =>
            track.mode === "showing" &&
            Array.from(track.cues ?? []).some(
              (cue) => cue.text === "Fixture caption.",
            ),
        ),
      ),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await playlist.click();
  await save.click();
  await expect(status).toHaveText("Position saved.");
  await expect(playlist).toBeFocused();

  const cmaf = page.waitForResponse("**/fixtures/cmaf/index.m3u8");
  await playlist.click();
  await firstClip.press("ArrowRight");
  await expect(secondClip).toBeChecked();
  await expect(secondClip).toBeFocused();
  expect((await cmaf).ok()).toBe(true);
  await page.keyboard.press("Escape");
  await settings.click();
  await expect(captions).toBeDisabled();
  await page.keyboard.press("Escape");
  await playlist.click();
  await expect(restart).toBeEnabled();
  await expect.poll(time).toBeLessThan(0.25);
  await presentFrame(video, 8);
  await save.click();
  await expect(status).toHaveText("Position saved.");

  await playlist.click();
  await secondClip.press("ArrowLeft");
  await expect(status).toHaveText("Saved position restored.");
  await expect.poll(time).toBeGreaterThan(3.75);
  expect(await time()).toBeLessThan(5);

  // Finishing one asset clears only that asset's stored position.
  await video.evaluate(async (element) => {
    element.currentTime = element.duration - 0.2;
    await element.play();
  });
  await expect(status).toHaveText("Playback finished.");
  await page.keyboard.press("Escape");
  await playlist.click();
  await firstClip.press("ArrowRight");
  await expect(status).toHaveText("Saved position restored.");
  await expect.poll(time).toBeGreaterThan(7.75);
  expect(await time()).toBeLessThan(9);
  await restart.click();
  await expect(status).toHaveText("Position cleared.");
  await expect.poll(time).toBeLessThan(0.25);

  await playlist.click();
  await secondClip.press("ArrowLeft");
  await expect(restart).toBeEnabled();
  await expect.poll(time).toBeLessThan(0.25);
  await expect(status).toBeEmpty();
  await page.keyboard.press("Escape");
  await playlist.click();
  await firstClip.press("ArrowRight");
  await expect(restart).toBeEnabled();
  await expect.poll(time).toBeLessThan(0.25);
  await expect(status).toBeEmpty();
});

test("the VOD playlist plays when session storage is denied", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new DOMException("Storage denied", "SecurityError");
      },
    });
  });
  await page.goto("/?playlist");
  await page.getByRole("button", { name: /^Playlist / }).click();
  await expect(page.getByRole("button", { name: "Start over" })).toBeEnabled();
  await presentFrame(page.locator("video"), 2);
  await page.getByRole("button", { name: "Save position" }).click();
  await expect(page.getByTestId("playlist-notice")).toHaveText(
    "Position could not be saved.",
  );
});
