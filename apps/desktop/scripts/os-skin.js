/*
 * Yaatal OS Shop-pane palette shim (UI unification).
 * Injected ONLY into the packaged copy of BOBO by scripts/build-shop.mjs —
 * the vendored BOBO source stays untouched (tree parity with the pinned
 * revision is preserved; this file lives beside the export, not in it).
 *
 * React Native Web injects atomic style rules at runtime through the CSSOM
 * (`style.sheet.insertRule`), so the <style> node's textContent stays empty
 * and static overrides lose the cascade race. This shim rewrites BOBO's
 * "Lagos Gold & Midnight Indigo" light palette in every CSS rule as it is
 * inserted — via the CSSOM itself, property-aware (background-color vs
 * color), and idempotent via a WeakSet marker on the sheet.
 */
(function () {
  "use strict";

  var OS = {
    bg: "rgb(20, 22, 19)",        // #141613 warm charcoal (page canvas)
    surface: "rgb(29, 32, 28)",   // #1d201c elevated card
    surface2: "rgb(38, 42, 37)",  // #262a25 subtle area
    border: "rgb(58, 62, 55)",    // #3a3e37
    ink: "rgb(246, 242, 233)",    // #f6f2e9 cream text
    inkMuted: "rgb(176, 174, 165)", // #b0aea5 warm silver
    inkFaint: "rgb(138, 141, 132)", // #8a8d84
    amber: "rgb(232, 189, 86)",  // #e8bd56 brand accent
    amberHover: "rgb(246, 206, 109)",
    amberDeep: "rgb(201, 155, 60)",
    ok: "rgb(59, 153, 84)",       // #3b9954
    warn: "rgb(232, 189, 86)",
    err: "rgb(221, 107, 53)",     // #dd6b35 terracotta
    info: "rgb(94, 140, 190)",
  };

  // BOBO light-theme color: [background-color replacement, color replacement]
  var MAP = {
    "rgb(253, 251, 247)": [OS.bg, OS.ink],
    "rgb(255, 255, 255)": [OS.surface, OS.ink],
    "rgb(243, 244, 246)": [OS.surface2, OS.inkMuted],
    "rgb(242, 242, 242)": [OS.surface2, OS.inkMuted],
    "rgb(17, 24, 39)": [OS.bg, OS.ink],
    "rgb(46, 16, 101)": [OS.amber, OS.amber],
    "rgb(76, 29, 149)": [OS.amberHover, OS.amberHover],
    "rgb(30, 27, 75)": [OS.amberDeep, OS.amberDeep],
    "rgb(75, 85, 99)": [OS.surface2, OS.inkMuted],
    "rgb(156, 163, 175)": [OS.border, OS.inkFaint],
    "rgb(229, 231, 235)": [OS.border, OS.border],
    "rgb(209, 213, 219)": [OS.border, OS.border],
    "rgb(5, 150, 105)": [OS.ok, OS.ok],
    "rgb(220, 38, 38)": [OS.err, OS.err],
    "rgb(217, 119, 6)": [OS.warn, OS.warn],
    "rgb(37, 99, 235)": [OS.info, OS.info],
  };

  var skinned = new WeakSet();

  function rewriteCssText(css) {
    if (!css || css.indexOf("rgb(") === -1) return css;
    var out = css;
    for (var key in MAP) {
      if (!Object.prototype.hasOwnProperty.call(MAP, key)) continue;
      var pair = MAP[key];
      // background-color (also plain background shorthand) → surface mapping
      out = out.replace(
        new RegExp("(background(?:-color)?\\s*:\\s*)" + key.replace(/[()]/g, "\\$&"), "g"),
        "$1" + pair[0],
      );
      // bare color property → ink mapping (negative lookbehind via property name)
      out = out.replace(
        new RegExp("(^|[;{\\s])color(\\s*:\\s*)" + key.replace(/[()]/g, "\\$&"), "g"),
        "$1color$2" + pair[1],
      );
    }
    return out;
  }

  function skinSheet(sheet) {
    if (!sheet) return;
    var rules;
    try { rules = sheet.cssRules; } catch (e) { return; }
    if (!rules || rules.length === 0) return; // nothing to skin yet — retry later
    var changed = false;
    try {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (!rule || !rule.style) continue;
        var props = ["background-color", "background", "color", "border-color", "border-top-color", "border-bottom-color", "border-left-color", "border-right-color"];
        for (var p = 0; p < props.length; p++) {
          var prop = props[p];
          var value;
          try { value = rule.style.getPropertyValue(prop); } catch (e) { continue; }
          if (!value) continue;
          var isBg = prop.indexOf("background") === 0;
          var isBorder = prop.indexOf("border") === 0;
          for (var key in MAP) {
            if (!Object.prototype.hasOwnProperty.call(MAP, key)) continue;
            if (value.indexOf(key) !== -1) {
              var replacement = isBg ? MAP[key][0] : (isBorder ? MAP[key][0] : MAP[key][1]);
              rule.style.setProperty(prop, value.split(key).join(replacement), rule.style.getPropertyPriority(prop) || "");
              changed = true;
            }
          }
        }
      }
    } catch (e) { /* unreadable sheet: skip */ }
    // Mark fully-processed sheets only when they were non-empty AND contained
    // no remaining mappable colors — new inserts still go through the patch.
    var remaining = false;
    try {
      outer: for (var i2 = 0; i2 < rules.length; i2++) {
        var r2 = rules[i2];
        if (!r2 || !r2.style) continue;
        for (var key2 in MAP) {
          if (!Object.prototype.hasOwnProperty.call(MAP, key2)) continue;
          var v2 = r2.style.getPropertyValue("background-color") || r2.style.getPropertyValue("color") || "";
          if (v2 && v2.indexOf(key2) !== -1) { remaining = true; break outer; }
        }
      }
    } catch (e) { /* ignore */ }
    if (!remaining) skinned.add(sheet);
    return changed;
  }

  function skinAllSheets() {
    var styles = document.querySelectorAll("style");
    for (var i = 0; i < styles.length; i++) {
      var sheet = styles[i].sheet;
      if (!sheet || skinned.has(sheet)) continue;
      skinSheet(sheet);
    }
  }

  // Patch insertRule so rules injected after this point are rewritten on arrival.
  var origInsert = CSSStyleSheet.prototype.insertRule;
  CSSStyleSheet.prototype.insertRule = function (rule, index) {
    try { rule = rewriteCssText(rule); } catch (e) { /* pass through */ }
    var at = origInsert.call(this, rule, index);
    skinSheet(this);
    return at;
  };

  // RNW also sets some colors as inline element styles (e.g. SafeArea strips).
  // Rewrite those on the DOM itself, continuously, cheaply.
  function mapColor(value, isBg) {
    if (!value || value.indexOf("rgb(") === -1) return value;
    for (var key in MAP) {
      if (!Object.prototype.hasOwnProperty.call(MAP, key)) continue;
      if (value.indexOf(key) !== -1) {
        value = value.split(key).join(isBg ? MAP[key][0] : MAP[key][1]);
      }
    }
    return value;
  }

  var inlineObserver = new MutationObserver(function () {
    var all = document.querySelectorAll("#root [style*='rgb(']");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var bg = el.style.backgroundColor || el.style.background;
      if (bg) {
        var next = mapColor(bg, true);
        if (next !== bg) el.style.backgroundColor = next;
      }
      var color = el.style.color;
      if (color) {
        var nextColor = mapColor(color, false);
        if (nextColor !== color) el.style.color = nextColor;
      }
    }
  });

  function startInlineWatch() {
    var root = document.getElementById("root");
    if (!root) return setTimeout(startInlineWatch, 50);
    inlineObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
  }
  startInlineWatch();

  skinAllSheets();
  new MutationObserver(skinAllSheets).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();