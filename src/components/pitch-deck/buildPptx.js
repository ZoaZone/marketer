import { makeZip } from "./zipStore";

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const hex = (c, fb) => (/^#?[0-9a-f]{6}$/i.test(c || "") ? c.replace("#", "").toUpperCase() : fb);
const fill = (c) => `<a:solidFill><a:srgbClr val="${c}"/></a:solidFill>`;
const xfrm = (x, y, w, h) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;

function run(text, { size, bold, color, font }) {
  return `<a:r><a:rPr lang="en-US" sz="${size}" b="${bold ? 1 : 0}" dirty="0">${fill(color)}<a:latin typeface="${esc(font)}"/></a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}

function textBox(id, name, [x, y, w, h], paras) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="t"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
}

const rect = (id, [x, y, w, h], color) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Bar ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill(color)}<a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;

function slideXml(slide, i, total, deckTitle, c, logoBox) {
  let id = 2;
  let shapes = rect(id++, [0, 6678000, 12192000, 180000], c.primary);
  if (logoBox) shapes += `<p:pic><p:nvPicPr><p:cNvPr id="${id++}" name="Logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(...logoBox)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  if (i === 0) {
    shapes += textBox(id++, "Title", [914400, 2000000, 10363200, 1500000], `<a:p>${run(slide.title || deckTitle, { size: 4400, bold: true, color: "FFFFFF", font: c.font })}</a:p>`);
    if (slide.bullets?.[0]) shapes += textBox(id++, "Tagline", [914400, 3600000, 10363200, 900000], `<a:p>${run(slide.bullets[0], { size: 2400, color: c.accent, font: c.font })}</a:p>`);
  } else {
    shapes += textBox(id++, "Title", [800000, 800000, 10592000, 1000000], `<a:p>${run(slide.title, { size: 3200, bold: true, color: c.secondary, font: c.font })}</a:p>`);
    const bullets = (slide.bullets || []).map(b =>
      `<a:p><a:pPr marL="342900" indent="-342900"><a:spcAft><a:spcPts val="1200"/></a:spcAft><a:buClr><a:srgbClr val="${c.accent}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/></a:pPr>${run(b, { size: 2400, color: "EBEBF5", font: c.font })}</a:p>`).join("");
    shapes += textBox(id++, "Content", [800000, 1950000, 10592000, 4300000], bullets || "<a:p><a:endParaRPr lang=\"en-US\"/></a:p>");
  }
  shapes += textBox(id++, "Slide number", [10600000, 6250000, 1300000, 350000], `<a:p><a:pPr algn="r"/>${run(`${i + 1} / ${total}`, { size: 1100, color: "9696AA", font: c.font })}</a:p>`);
  return `${HEAD}<p:sld ${NS}><p:cSld><p:bg><p:bgPr>${fill("100C1A")}<a:effectLst/></p:bgPr></p:bg><p:spTree>${GRP}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function themeXml(c) {
  const clr = (n, v) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
  const font = `<a:latin typeface="${esc(c.font)}"/><a:ea typeface=""/><a:cs typeface=""/>`;
  const f3 = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3);
  return `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Brand"><a:themeElements><a:clrScheme name="Brand">${clr("dk1", "000000")}${clr("lt1", "FFFFFF")}${clr("dk2", "100C1A")}${clr("lt2", "EBEBF5")}${clr("accent1", c.primary)}${clr("accent2", c.secondary)}${clr("accent3", c.accent)}${clr("accent4", c.primary)}${clr("accent5", c.secondary)}${clr("accent6", c.accent)}${clr("hlink", c.accent)}${clr("folHlink", c.secondary)}</a:clrScheme><a:fontScheme name="Brand"><a:majorFont>${font}</a:majorFont><a:minorFont>${font}</a:minorFont></a:fontScheme><a:fmtScheme name="Brand"><a:fillStyleLst>${f3}</a:fillStyleLst><a:lnStyleLst>${'<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${f3}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

const rels = (items) => `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join("")}</Relationships>`;

// Builds an editable .pptx (native text boxes, no images of text) styled
// with the brand kit. `logo` is the result of loadLogo() or null.
export function buildPptx(deckTitle, slides, brand, logo) {
  const c = {
    primary: hex(brand?.primary_color, "7C3AED"),
    secondary: hex(brand?.secondary_color, "A855F7"),
    accent: hex(brand?.accent_color, "EC4899"),
    font: brand?.font_family || "Arial",
  };
  let logoBox = null;
  if (logo) {
    const h = 500000;
    const w = Math.min(2000000, Math.round((logo.w / logo.h) * h));
    logoBox = [400000, 220000, w, Math.round((w / logo.w) * logo.h)];
  }
  const n = slides.length;
  const files = [
    { name: "[Content_Types].xml", data: `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", data: rels([["rId1", "officeDocument", "ppt/presentation.xml"]]) },
    { name: "ppt/presentation.xml", data: `${HEAD}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join("")}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>` },
    { name: "ppt/_rels/presentation.xml.rels", data: rels([["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ["rId2", "theme", "theme/theme1.xml"], ...slides.map((_, i) => [`rId${i + 3}`, "slide", `slides/slide${i + 1}.xml`])]) },
    { name: "ppt/slideMasters/slideMaster1.xml", data: `${HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>` },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", data: rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "theme", "../theme/theme1.xml"]]) },
    { name: "ppt/slideLayouts/slideLayout1.xml", data: `${HEAD}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GRP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>` },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", data: rels([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]) },
    { name: "ppt/theme/theme1.xml", data: themeXml(c) },
  ];
  slides.forEach((s, i) => {
    files.push({ name: `ppt/slides/slide${i + 1}.xml`, data: slideXml(s, i, n, deckTitle, c, logoBox) });
    files.push({ name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ...(logo ? [["rId2", "image", `../media/logo.${logo.ext}`]] : [])]) });
  });
  if (logo) files.push({ name: `ppt/media/logo.${logo.ext}`, data: logo.bytes });
  return makeZip(files, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
}