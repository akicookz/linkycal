import { describe, expect, test } from "bun:test";
import {
  getSectionImage,
  sectionImageStyle,
  sectionShowsFieldsTogether,
} from "../src/lib/form-sections";

describe("sectionShowsFieldsTogether", () => {
  test("true only when groupFields is exactly true", () => {
    expect(sectionShowsFieldsTogether({ groupFields: true })).toBe(true);
    expect(sectionShowsFieldsTogether({ groupFields: false })).toBe(false);
    expect(sectionShowsFieldsTogether({})).toBe(false);
    expect(sectionShowsFieldsTogether(null)).toBe(false);
    expect(sectionShowsFieldsTogether("nope")).toBe(false);
  });
});

describe("getSectionImage", () => {
  test("returns null when there is no image", () => {
    expect(getSectionImage(null)).toBeNull();
    expect(getSectionImage({})).toBeNull();
    expect(getSectionImage({ image: {} })).toBeNull();
    expect(getSectionImage({ image: { url: "" } })).toBeNull();
  });

  test("parses a full image config", () => {
    expect(
      getSectionImage({
        image: { url: "/x.png", layout: "right", scale: 1.6, focusX: 18, focusY: 12 },
      }),
    ).toEqual({ url: "/x.png", layout: "right", scale: 1.6, focusX: 18, focusY: 12 });
  });

  test("applies defaults and clamps for missing/invalid fields", () => {
    expect(getSectionImage({ image: { url: "/x.png" } })).toEqual({
      url: "/x.png",
      layout: "left",
      scale: 1,
      focusX: 50,
      focusY: 50,
    });
    expect(
      getSectionImage({
        image: { url: "/x.png", layout: "bogus", scale: 0.5, focusX: 200, focusY: -40 },
      }),
    ).toEqual({ url: "/x.png", layout: "left", scale: 1, focusX: 100, focusY: 0 });
  });
});

describe("sectionImageStyle", () => {
  test("centers with no transform at scale 1", () => {
    expect(sectionImageStyle({ scale: 1, focusX: 50, focusY: 50 })).toEqual({
      objectFit: "cover",
      objectPosition: "50% 50%",
      transform: undefined,
      transformOrigin: "50% 50%",
    });
  });

  test("applies scale + matching origin/position when zoomed", () => {
    expect(sectionImageStyle({ scale: 1.6, focusX: 18, focusY: 12 })).toEqual({
      objectFit: "cover",
      objectPosition: "18% 12%",
      transform: "scale(1.6)",
      transformOrigin: "18% 12%",
    });
  });
});
