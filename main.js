/* Indexed Annuity Secrets — interactions + lead capture
   ─────────────────────────────────────────────────────────
   LEAD CAPTURE CONFIGURATION
   ─────────────────────────────────────────────────────────
   Most form submissions are POSTed to a Supabase Edge Function
   ("submit-lead"). That function stores the lead in the
   Postgres database AND forwards it to Follow Up Boss.

   The Contact form additionally requires SMS verification: it
   texts a one-time code (via "send-code"), the visitor enters
   it in a popup, and only a verified lead is registered (via
   "verify-lead"). Forms opt into this with the data-otp attribute.

   All API keys live ONLY on the server, as Supabase secrets —
   they are never exposed in the browser.
   ───────────────────────────────────────────────────────── */

  var LEAD_ENDPOINT        = "https://ppemattxkpbriqnrdqee.supabase.co/functions/v1/submit-lead";
  var SEND_CODE_ENDPOINT   = "https://ppemattxkpbriqnrdqee.supabase.co/functions/v1/send-code";
  var VERIFY_LEAD_ENDPOINT = "https://ppemattxkpbriqnrdqee.supabase.co/functions/v1/verify-lead";

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

  /* ── Build a Follow Up Boss–shaped payload from a form ── */
  function buildPayload(form) {
    var fn  = form.querySelector("#fn");
    var ln  = form.querySelector("#ln");
    var em  = form.querySelector("#em");
    var ph  = form.querySelector("#ph");
    var msg = form.querySelector("#msg");
    var hp  = form.querySelector("#hp");
    var phoneVal = (ph && ph.value.trim()) ? ph.value.trim() : "";
    return {
      firstName: fn ? fn.value.trim() : "",
      lastName:  ln ? ln.value.trim() : "",
      emails:    (em && em.value.trim()) ? [{ value: em.value.trim(), type: "work" }] : [],
      phones:    phoneVal ? [{ value: phoneVal, type: "mobile" }] : [],
      phone:     phoneVal,
      tags:      [getTag()],
      source:    "Indexed Annuity Secrets Website",
      notes:     (msg && msg.value.trim()) ? [{ body: msg.value.trim() }] : [],
      website:   hp ? hp.value : ""
    };
  }

  /* ── Submit the lead directly (non-OTP forms) ───────── */
  function submitLead(form, btn) {
    var payload = buildPayload(form);

    /* Honeypot: real people leave this blank. If filled → bot → fake success. */
    if (payload.website) { showSuccess(form, btn); return; }

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
      if (!res.ok) console.warn("[IAS] Lead endpoint returned", res.status);
      showSuccess(form, btn);
    })
    .catch(function(err) {
      console.error("[IAS] Lead submit error:", err);
      showSuccess(form, btn);
    });
  }

  function showSuccess(form, btn) {
    if (btn) { btn.disabled = false; btn.textContent = btn._orig || "Submit"; }
    var successEl = form.parentElement.querySelector(".form-success");
    form.style.display = "none";
    if (successEl) successEl.classList.add("show");
  }

  function setFormError(form, message) {
    var box = form.querySelector(".form-error");
    if (!box) {
      box = document.createElement("p");
      box.className = "form-error";
      box.setAttribute("role", "alert");
      var submitBtn = form.querySelector("[type=submit]");
      if (submitBtn) submitBtn.parentElement.insertBefore(box, submitBtn);
      else form.appendChild(box);
    }
    box.textContent = message;
    box.style.display = "block";
  }
  function clearFormError(form) {
    var box = form.querySelector(".form-error");
    if (box) box.style.display = "none";
  }

  /* ── SMS one-time-passcode flow (Contact form) ──────── */
  var otp = {
    modal:   null,
    input:   null, verifyBtn: null, resendBtn: null, closeBtn: null,
    errEl:   null, toEl: null,
    form:    null, payload: null
  };

  /* Popup styles + markup are injected here so any page with a
     data-otp form shows the verification popup — no per-page HTML. */
  var OTP_STYLES = ".form-error{background:#fbe9e6;color:#a5342a;border:1px solid #eec2bb;border-radius:10px;padding:10px 12px;font-size:14px;margin:0 0 14px;display:none}"
    + ".otp{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(11,18,32,.62);padding:20px}"
    + ".otp[hidden]{display:none}"
    + ".otp__card{background:#fff;color:#16233c;border-radius:18px;max-width:410px;width:100%;padding:30px 28px 26px;text-align:center;position:relative;box-shadow:0 24px 70px rgba(11,18,32,.45);font-family:'Inter',system-ui,sans-serif}"
    + ".otp__close{position:absolute;top:12px;right:16px;border:0;background:none;font-size:28px;line-height:1;color:#9aa5ba;cursor:pointer;padding:4px}.otp__close:hover{color:#16233c}"
    + ".otp__icon{font-size:40px;line-height:1}"
    + ".otp__card h3{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:23px;margin:10px 0 6px;color:#16233c}"
    + ".otp__sub{color:#53617d;font-size:14.5px;line-height:1.5;margin:0 0 20px}.otp__sub b{color:#16233c;white-space:nowrap}"
    + ".otp__input{width:100%;font-size:30px;letter-spacing:.45em;text-align:center;padding:14px 10px;border:2px solid #d8dee9;border-radius:12px;font-family:'Inter',monospace;color:#16233c;margin-bottom:8px;box-sizing:border-box}"
    + ".otp__input::placeholder{color:#c3ccda;letter-spacing:.35em}"
    + ".otp__input:focus{outline:none;border-color:#b0821f;box-shadow:0 0 0 3px rgba(176,130,31,.15)}"
    + ".otp__err{color:#c0392b;font-size:13.5px;margin:2px 0 14px;min-height:1em}"
    + ".otp__resend{margin-top:14px;background:none;border:0;color:#a9791f;font-weight:600;cursor:pointer;font-size:14px;font-family:inherit}.otp__resend:disabled{color:#9aa5ba;cursor:default}"
    + ".otp__fine{margin:16px 0 0;font-size:12px;color:#9aa5ba}";

  var OTP_MARKUP =
      '<div class="otp" id="otpModal" hidden><div class="otp__card" role="dialog" aria-modal="true" aria-labelledby="otpTitle">'
    + '<button class="otp__close" type="button" aria-label="Close">&times;</button>'
    + '<div class="otp__icon" aria-hidden="true">📱</div>'
    + '<h3 id="otpTitle">Verify your phone</h3>'
    + '<p class="otp__sub">We texted a 6-digit code to <b class="otp__to"></b>.<br>Enter it below to continue.</p>'
    + '<input class="otp__input" id="otpCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="––––––" aria-label="6-digit verification code">'
    + '<p class="otp__err" hidden></p>'
    + '<button class="btn btn--gold btn--lg otp__verify" type="button" style="width:100%">Verify &amp; Continue</button>'
    + '<button class="otp__resend" type="button">Resend code</button>'
    + '<p class="otp__fine">This quick step confirms you\'re a real person. Standard message rates may apply.</p>'
    + '</div></div>';

  function ensureOtpModal() {
    if (document.getElementById("otpModal")) return;
    if (!document.querySelector("form[data-otp]")) return;
    if (!document.getElementById("otp-styles")) {
      var st = document.createElement("style");
      st.id = "otp-styles";
      st.textContent = OTP_STYLES;
      document.head.appendChild(st);
    }
    var wrap = document.createElement("div");
    wrap.innerHTML = OTP_MARKUP;
    document.body.appendChild(wrap.firstElementChild);
  }

  function otpReady() { return !!otp.modal; }

  function initOtpModal() {
    otp.modal = document.getElementById("otpModal");
    if (!otp.modal) return;
    otp.input     = otp.modal.querySelector("#otpCode");
    otp.verifyBtn = otp.modal.querySelector(".otp__verify");
    otp.resendBtn = otp.modal.querySelector(".otp__resend");
    otp.closeBtn  = otp.modal.querySelector(".otp__close");
    otp.errEl     = otp.modal.querySelector(".otp__err");
    otp.toEl      = otp.modal.querySelector(".otp__to");

    if (otp.closeBtn)  otp.closeBtn.addEventListener("click", closeOtp);
    otp.modal.addEventListener("click", function (e) { if (e.target === otp.modal) closeOtp(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && otp.modal && !otp.modal.hidden) closeOtp();
    });
    if (otp.input) {
      otp.input.addEventListener("input", function () {
        otp.input.value = otp.input.value.replace(/\D/g, "").slice(0, 6);
        hideOtpErr();
      });
      otp.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); doVerify(); }
      });
    }
    if (otp.verifyBtn) otp.verifyBtn.addEventListener("click", doVerify);
    if (otp.resendBtn) otp.resendBtn.addEventListener("click", doResend);
  }

  function showOtpErr(msg) { if (otp.errEl) { otp.errEl.textContent = msg; otp.errEl.hidden = false; } }
  function hideOtpErr()    { if (otp.errEl) otp.errEl.hidden = true; }

  function openOtp(form, payload) {
    otp.form = form; otp.payload = payload;
    if (otp.toEl) otp.toEl.textContent = payload.phone;
    if (otp.input) otp.input.value = "";
    hideOtpErr();
    if (otp.resendBtn) { otp.resendBtn.disabled = false; otp.resendBtn.textContent = "Resend code"; }
    if (otp.verifyBtn) { otp.verifyBtn.disabled = false; otp.verifyBtn.textContent = "Verify & Continue"; }
    otp.modal.hidden = false;
    setTimeout(function () { if (otp.input) otp.input.focus(); }, 50);
  }

  function closeOtp() {
    if (!otp.modal) return;
    otp.modal.hidden = true;
    var btn = otp.form ? otp.form.querySelector("[type=submit]") : null;
    if (btn) { btn.disabled = false; btn.textContent = btn._orig || "Submit"; }
  }

  /* Step 1 — send the code, then open the popup */
  function startOtp(form, btn) {
    var payload = buildPayload(form);

    /* Honeypot → silent fake success, no SMS */
    if (payload.website) { showSuccess(form, btn); return; }

    /* Safety net: if the popup markup is missing, fall back to direct submit */
    if (!otpReady()) { submitLead(form, btn); return; }

    clearFormError(form);
    if (btn) { btn.disabled = true; btn.textContent = "Sending code…"; }

    fetch(SEND_CODE_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ phone: payload.phone, website: payload.website })
    })
    .then(readJson)
    .then(function (res) {
      if (btn) { btn.disabled = false; btn.textContent = btn._orig || "Submit"; }
      if (res.ok && res.body && res.body.ok) {
        openOtp(form, payload);
      } else if (res.body && res.body.error === "invalid_phone") {
        setFormError(form, "Please enter a valid mobile number that can receive text messages.");
      } else {
        setFormError(form, "We couldn't send a verification text right now. Please try again, or call us at 619-374-8100.");
      }
    })
    .catch(function () {
      if (btn) { btn.disabled = false; btn.textContent = btn._orig || "Submit"; }
      setFormError(form, "Network error. Please check your connection and try again.");
    });
  }

  /* Step 2 — verify the code; on success the lead is registered server-side */
  function doVerify() {
    if (!otp.payload) return;
    var code = (otp.input ? otp.input.value : "").replace(/\D/g, "");
    if (code.length < 4) { showOtpErr("Enter the 6-digit code from your text."); return; }
    hideOtpErr();
    if (otp.verifyBtn) { otp.verifyBtn.disabled = true; otp.verifyBtn.textContent = "Verifying…"; }

    var body = {};
    for (var k in otp.payload) body[k] = otp.payload[k];
    body.code = code;

    fetch(VERIFY_LEAD_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body)
    })
    .then(readJson)
    .then(function (res) {
      if (otp.verifyBtn) { otp.verifyBtn.disabled = false; otp.verifyBtn.textContent = "Verify & Continue"; }
      if (res.ok && res.body && res.body.ok) {
        var form = otp.form;
        otp.modal.hidden = true;
        showSuccess(form, null);
      } else if (res.body && res.body.error === "code") {
        showOtpErr("That code isn't right or has expired. Please try again.");
      } else if (res.body && res.body.error === "missing_phone_or_code") {
        showOtpErr("Please enter the 6-digit code from your text.");
      } else {
        showOtpErr("Something went wrong verifying the code. Please try again.");
      }
    })
    .catch(function () {
      if (otp.verifyBtn) { otp.verifyBtn.disabled = false; otp.verifyBtn.textContent = "Verify & Continue"; }
      showOtpErr("Network error. Please try again.");
    });
  }

  /* Resend a fresh code */
  function doResend() {
    if (!otp.payload) return;
    if (otp.resendBtn) { otp.resendBtn.disabled = true; otp.resendBtn.textContent = "Sending…"; }
    hideOtpErr();
    fetch(SEND_CODE_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ phone: otp.payload.phone, website: otp.payload.website })
    })
    .then(readJson)
    .then(function () {
      if (otp.resendBtn) { otp.resendBtn.textContent = "Code sent ✓"; }
      setTimeout(function () {
        if (otp.resendBtn) { otp.resendBtn.disabled = false; otp.resendBtn.textContent = "Resend code"; }
      }, 4000);
    })
    .catch(function () {
      if (otp.resendBtn) { otp.resendBtn.disabled = false; otp.resendBtn.textContent = "Resend code"; }
    });
  }

  function readJson(r) {
    return r.json().then(function (j) { return { ok: r.ok, body: j }; })
                   .catch(function () { return { ok: r.ok, body: {} }; });
  }

  ensureOtpModal();
  initOtpModal();

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
      if (btn) { btn._orig = btn.textContent; }
      if (form.hasAttribute("data-otp")) {
        startOtp(form, btn);            /* Contact form → SMS verify first */
      } else {
        if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
        submitLead(form, btn);          /* other forms → submit directly */
      }
    });
  });

  /* ── Footer year ────────────────────────────────────── */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

})();
