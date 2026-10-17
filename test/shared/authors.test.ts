// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { authorKey, authorName, authorUser, liveAuthorName } from "../../src/web/lib/authors";

const site = {
  users: [
    { login: "octocat", id: 1, name: "Octo Cat" },
    { login: "nameless", id: 2, name: null },
  ],
};

describe("authors", () => {
  it("finds the user by author_id, ignoring case, whatever the author text says", () => {
    expect(authorUser({ author: "Old Name", authorId: "OctoCat" }, site)?.id).toBe(1);
    expect(authorUser({ author: "Octo Cat", authorId: "someone-else" }, site)).toBeUndefined();
  });

  it("matches a file without author_id by name or login", () => {
    expect(authorUser({ author: "octo cat" }, site)?.id).toBe(1);
    expect(authorUser({ author: "nameless" }, site)?.id).toBe(2);
    expect(authorUser({ author: "" }, site)).toBeUndefined();
  });

  it("shows the current name for an author_id, the author text otherwise", () => {
    expect(authorName({ author: "Old Name", authorId: "octocat" }, site)).toBe("Octo Cat");
    expect(authorName({ author: "", authorId: "nameless" }, site)).toBe("nameless");
    // No longer a user (access removed): the last known name.
    expect(authorName({ author: "Former Writer", authorId: "former" }, site)).toBe("Former Writer");
    expect(authorName({ author: "", authorId: "former" }, site)).toBe("former");
    expect(authorName({ author: "Guest Writer" }, site)).toBe("Guest Writer");
  });

  it("gives one key per person, so old names and author_id count as the same author", () => {
    expect(authorKey({ author: "Old Name", authorId: "OctoCat" }, site)).toBe("@octocat");
    expect(authorKey({ author: "Octo Cat" }, site)).toBe("@octocat");
    expect(authorKey({ author: "Former Writer", authorId: "Former" }, site)).toBe("@former");
    expect(authorKey({ author: "Guest Writer" }, site)).toBe("Guest Writer");
  });

  it("updates the author text to the user's current name on saving, and keeps it otherwise", () => {
    expect(liveAuthorName({ author: "Old Name", authorId: "octocat" }, site)).toBe("Octo Cat");
    expect(liveAuthorName({ author: "Kept", authorId: "nameless" }, site)).toBe("Kept");
    expect(liveAuthorName({ author: "", authorId: "nameless" }, site)).toBe("nameless");
    expect(liveAuthorName({ author: "Former Writer", authorId: "former" }, site)).toBe("Former Writer");
    expect(liveAuthorName({ author: " Spaced " }, site)).toBe(" Spaced ");
  });
});
