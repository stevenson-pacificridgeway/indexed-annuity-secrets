/* Indexed Annuity Secrets — interactions + lead capture
   ─────────────────────────────────────────────────────────
   LEAD CAPTURE CONFIGURATION
   ─────────────────────────────────────────────────────────
   Form submissions are POSTed to a Supabase Edge Function
   ("submit-lead"). That function stores the lead in the
   Postgres database AND forwards it to Follow Up Boss.

   The Follow Up Boss API key lives ONLY on the server, as a
   Supabase secret — it is never exposed in the browser.

   Set LEAD_ENDPOINT to your deployed function URL:
     https://<project-ref>.supabase.co/functions/v1/submit-lead
   ───────────────────────────────────────────────────────── */

  var LEAD_ENDPOINT = "https://ppemattxkpbriqnrdqee.supabase.co/functions/v1/submit-lead";

/* ───────────────────────────────────────────────────────── */

(function () {
  "use strict";

  /* ── Mobile nav ─────────────────────────────────────── */
  var nav    = document.querySelector(".nav");
  var toggle = document.querySelector(".nav__toggle");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", nav.classList.contains("open") ? "true" : "false");
    });
    nav.querySelectorAll(".nav__links a").forEach(function (a) {
      a.addEventListener("click", function () { nav.classList.remove("open"); });
    });
  }

  /* ── Scroll reveal ──────────────────────────────────── */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ── Popup video ────────────────────────────────────── */
  var vpop = document.getElementById("vpop");
  if (vpop) {
    var video   = vpop.querySelector("video");
    var muteBtn = vpop.querySelector(".vpop__mute");
    var closeBtn= vpop.querySelector(".vpop__close");
    var dismissed = false;
    try { dismissed = sessionStorage.getItem("ias_vpop_dismissed") === "1"; } catch(e){}
    if (!dismissed) {
      setTimeout(function () {
        vpop.classList.add("show");
        if (video) { video.muted = true; video.play().catch(function(){}); }
      }, 2600);
    }
    if (muteBtn && video) {
      muteBtn.addEventListener("click", function () {
        video.muted = !video.muted;
        if (!video.muted) { video.play().catch(function(){}); }
        muteBtn.innerHTML = video.muted
          ? '<span aria-hidden="true">&#128266;</span> Tap to Unmute'
          : '<span aria-hidden="true">&#128263;</span> Mute';
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        vpop.classList.remove("show");
        if (video) video.pause();
        try { sessionStorage.setItem("ias_vpop_dismissed", "1"); } catch(e){}
      });
    }
    /* also close when clicking the dark backdrop */
    vpop.addEventListener("click", function(e) {
      if (e.target === vpop) {
        vpop.classList.remove("show");
        if (video) video.pause();
        try { sessionStorage.setItem("ias_vpop_dismissed", "1"); } catch(e){}
      }
    });
  }

  /* ── Validation helpers ─────────────────────────────── */
  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function isPhone(v) { return v.replace(/\D/g,"").length >= 10; }

  function validateForm(form) {
    var ok = true;
    form.querySelectorAll("[data-required]").forEach(function (input) {
      var val   = (input.value||"").trim();
      var type  = input.getAttribute("data-type");
      var valid = val.length > 0;
      if (valid && type === "email") valid = isEmail(val);
      if (valid && type === "phone") valid = isPhone(val);
      var err = input.parentElement.querySelector(".err");
      input.classList.toggle("invalid", !valid);
      if (err) err.classList.toggle("show", !valid);
      if (!valid) ok = false;
    });
    var consent = form.querySelector("[data-consent]");
    if (consent && !consent.checked) {
      ok = false;
      consent.parentElement.style.color = "#d9534f";
    } else if (consent) {
      consent.parentElement.style.color = "";
    }
    return ok;
  }

  /* ── Determine tag by page ──────────────────────────── */
  function getTag() {
    var path = window.location.pathname.toLowerCase();
    if (path.includes("preview"))      return "ias-free-book";
    if (path.includes("contact"))      return "ias-contact-form";
    if (path.includes("join"))         return "ias-join-team";
    return "ias-website";
  }

  /* ── Submit the lead to the Supabase Edge Function ──── */
  function submitLead(form, btn) {
    var fn  = form.querySelector("#fn");
    var ln  = form.querySelector("#ln");
    var em  = form.querySelector("#em");
    var ph  = form.querySelector("#ph");
    var msg = form.querySelector("#msg");

    /* Follow Up Boss–shaped payload; the Edge Function reads
       these fields for the database and forwards them to FUB. */
    var payload = {
      firstName: fn  ? fn.value.trim()  : "",
      lastName:  ln  ? ln.value.trim()  : "",
      emails:    em  ? [{ value: em.value.trim(), type: "work" }] : [],
      phones:    (ph && ph.value.trim()) ? [{ value: ph.value.trim(), type: "mobile" }] : [],
      tags:      [getTag()],
      source:    "Indexed Annuity Secrets Website",
      notes:     msg && msg.value.trim() ? [{ body: msg.value.trim() }] : []
    };

    /* No endpoint configured yet — show success without sending */
    if (!LEAD_ENDPOINT || LEAD_ENDPOINT.indexOf("YOUR-PROJECT-REF") !== -1) {
      console.warn("[IAS] LEAD_ENDPOINT not set. Showing success without submitting.");
      showSuccess(form, btn);
      return;
    }

    fetch(LEAD_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload)
    })
    .then(function(res) {
      if (res.ok) {
        console.log("[IAS] Lead captured:", payload.firstName, payload.lastName);
      } else {
        console.warn("[IAS] Lead endpoint returned", res.status);
      }
      showSuccess(form, btn); /* always show success to the user */
    })
    .catch(function(err) {
      console.error("[IAS] Lead submit error:", err);
      showSuccess(form, btn); /* fail silently to the user */
    });
  }

  function showSuccess(form, btn) {
    if (btn) { btn.disabled = false; btn.textContent = btn._orig || "Submit"; }
    var successEl = form.parentElement.querySelector(".form-success");
    form.style.display = "none";
    if (successEl) successEl.classList.add("show");
  }

  /* ── Wire all forms ─────────────────────────────────── */
  document.querySelectorAll("form[data-validate]").forEach(function (form) {
    form.querySelectorAll("[data-required]").forEach(function (input) {
      input.addEventListener("input", function () {
        input.classList.remove("invalid");
        var err = input.parentElement.querySelector(".err");
        if (err) err.classList.remove("show");
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!validateForm(form)) return;
      var btn = form.querySelector("[type=submit]");
      if (btn) { btn._orig = btn.textContent; btn.disabled = true; btn.textContent = "Sending…"; }
      submitLead(form, btn);
    });
  });

  /* ── Footer year ────────────────────────────────────── */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

})();
