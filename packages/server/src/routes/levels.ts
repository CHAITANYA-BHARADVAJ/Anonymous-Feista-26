import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { io } from '../index';

const router = Router();

// Generate complete 25 Intermediate Clues + 1 Grand Finale Pack (26 Clues Total)
router.post('/game/:gameId/generate-25-pack', requireAuth('admin'), async (req, res) => {
  const gameId = Number(req.params.gameId);
  try {
    const SDMCET_26_PACK = [
      { orderIndex: 1, title: 'Main Library Plaque', clueText: 'Decipher the brass foundation inscription at the main library threshold.', locationHint: 'Near Main Library Entrance', answer: 'library', targetLat: 15.4294, targetLng: 75.0135, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Look on the right cornerstone of the stairs', penaltyMins: 2 }, { text: 'Check under the brass bell emblem', penaltyMins: 4 }] },
      { orderIndex: 2, title: 'Central Canteen Gazebo', clueText: 'Inspect the cyber notice stickers under the central wooden pavilion.', locationHint: 'Canteen Lawn Pavilion', answer: 'fiesta', targetLat: 15.4282, targetLng: 75.0152, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Examine the pillar facing the lawn', penaltyMins: 2 }] },
      { orderIndex: 3, title: 'Admin Portico Pillar', clueText: 'Find the carved seal on the west pillar of the Administrative Portico.', locationHint: 'Administrative Block Frontage', answer: 'sdmcet', targetLat: 15.4298, targetLng: 75.0138, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Walk behind the main stone pillars', penaltyMins: 2 }] },
      { orderIndex: 4, title: 'Science Block Board', clueText: 'Recover the cipher text on the physics lab corridor noticeboard.', locationHint: 'Science Block Ground Floor', answer: 'quantum', targetLat: 15.4289, targetLng: 75.0142, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Look for the green flyer with a QR code', penaltyMins: 2 }] },
      { orderIndex: 5, title: 'Mechanical Workshop Gate', clueText: 'Count the cog teeth on the mechanical landmark sculpture at the entrance.', locationHint: 'Mechanical Engineering Workshop', answer: 'gear', targetLat: 15.4268, targetLng: 75.0158, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Near the lathe workshop gateway', penaltyMins: 2 }] },
      { orderIndex: 6, title: 'Civil Surveying Yard', clueText: 'Locate the concrete benchmark marker near the total station pad.', locationHint: 'Civil Dept Surveying Lawn', answer: 'elevation', targetLat: 15.4275, targetLng: 75.0162, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Check the white concrete pillar', penaltyMins: 2 }] },
      { orderIndex: 7, title: 'Electrical Quadrangle', clueText: 'Find the electrical safety emblem code on the transformer fence.', locationHint: 'Electrical Block Quad', answer: 'voltage', targetLat: 15.4285, targetLng: 75.0130, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Yellow warning sign at the perimeter', penaltyMins: 2 }] },
      { orderIndex: 8, title: 'CSE Foyer Terminal', clueText: 'Decode the binary string framed in the Computer Science entrance lobby.', locationHint: 'CSE Department Foyer', answer: 'binary', targetLat: 15.4291, targetLng: 75.0149, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Near the department trophy case', penaltyMins: 2 }] },
      { orderIndex: 9, title: 'ECE Lab Annex', clueText: 'Find the frequency stencil painted on the radio telecommunication tower base.', locationHint: 'ECE Department Annex', answer: 'frequency', targetLat: 15.4287, targetLng: 75.0156, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Look on the metallic lattice leg', penaltyMins: 2 }] },
      { orderIndex: 10, title: 'Pavilion Bleachers', clueText: 'Look beneath row 4 of the main athletic ground spectator seating.', locationHint: 'Campus Sports Pavilion', answer: 'sprint', targetLat: 15.4305, targetLng: 75.0165, triggerRadiusMeters: 30, isFinal: false, hints: [{ text: 'Center aisle of the shaded stand', penaltyMins: 2 }] },
      { orderIndex: 11, title: 'Basketball Court Hoops', clueText: 'Read the painted coordinates on the south hoop backboard support.', locationHint: 'Outdoor Basketball Courts', answer: 'swish', targetLat: 15.4301, targetLng: 75.0159, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'On the padded base of the south post', penaltyMins: 2 }] },
      { orderIndex: 12, title: 'Silver Jubilee Audi', clueText: 'Decipher the founding year Roman numeral on the auditorium cornerstone.', locationHint: 'Silver Jubilee Auditorium', answer: 'theatre', targetLat: 15.4278, targetLng: 75.0139, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Right side of the main glass doors', penaltyMins: 2 }] },
      { orderIndex: 13, title: 'Biotech Garden Arch', clueText: 'Identify the medicinal plant species tag marked with a red tag.', locationHint: 'Biotechnology Botanical Garden', answer: 'flora', targetLat: 15.4263, targetLng: 75.0148, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Near the irrigation stone pathway', penaltyMins: 2 }] },
      { orderIndex: 14, title: 'Post Office & SBI Steps', clueText: 'Find the brass post box serial number on the bank veranda.', locationHint: 'Campus SBI Bank & Post Office', answer: 'courier', targetLat: 15.4308, targetLng: 75.0132, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Beside the red parcel box', penaltyMins: 2 }] },
      { orderIndex: 15, title: 'Dhavalagiri Hostel Arch', clueText: 'Examine the entrance arch badge of Dhavalagiri Hostel.', locationHint: 'Boys Hostel 1 (Dhavalagiri)', answer: 'crest', targetLat: 15.4260, targetLng: 75.0140, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Engraved stone on the right gatepost', penaltyMins: 2 }] },
      { orderIndex: 16, title: 'Sahyadri Lawn Bench', clueText: 'Inspect the iron park bench plaque facing the central garden.', locationHint: 'Boys Hostel 2 (Sahyadri)', answer: 'summit', targetLat: 15.4255, targetLng: 75.0146, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Under the shade of the mango tree', penaltyMins: 2 }] },
      { orderIndex: 17, title: 'Kaveri Outer Boundary', clueText: 'Find the campus directional signpost pointing towards the north gate.', locationHint: 'Girls Hostel Perimeter Road', answer: 'vector', targetLat: 15.4312, targetLng: 75.0155, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Reflective yellow signpost at the curve', penaltyMins: 2 }] },
      { orderIndex: 18, title: 'Gymnasium Portico', clueText: 'Record the motto inscribed above the fitness arena entrance glass doors.', locationHint: 'Campus Fitness Arena', answer: 'strength', targetLat: 15.4299, targetLng: 75.0168, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Upper lintel of the double doors', penaltyMins: 2 }] },
      { orderIndex: 19, title: 'Open Air Stage Backstage', clueText: 'Examine the green room acoustic door stencil backstage.', locationHint: 'Open Air Theater Backstage', answer: 'echo', targetLat: 15.4276, targetLng: 75.0149, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Concrete ramp behind stage left', penaltyMins: 2 }] },
      { orderIndex: 20, title: 'Health Center Arch', clueText: 'Locate the emergency red phone emblem code beside the dispensary window.', locationHint: 'Campus Health Center', answer: 'vital', targetLat: 15.4315, targetLng: 75.0138, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Right of the ambulance parking bay', penaltyMins: 2 }] },
      { orderIndex: 21, title: 'Placement Cell Gallery', clueText: 'Find the corporate alumni plaque code in the placement corridor.', locationHint: 'Placement & Training Cell', answer: 'career', targetLat: 15.4295, targetLng: 75.0145, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Outside Seminar Hall 1', penaltyMins: 2 }] },
      { orderIndex: 22, title: 'ISE Wing Terminal', clueText: 'Decrypt the ASCII banner framed near the ISE department server room.', locationHint: 'Information Science Wing', answer: 'packet', targetLat: 15.4290, targetLng: 75.0153, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'First floor north wing hallway', penaltyMins: 2 }] },
      { orderIndex: 23, title: 'Main South Gate', clueText: 'Find the surveillance sector number stamped on the south gate sentry post.', locationHint: 'Campus Main South Gate', answer: 'sentinel', targetLat: 15.4258, targetLng: 75.0142, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Security cabin window frame', penaltyMins: 2 }] },
      { orderIndex: 24, title: 'North Security Post', clueText: 'Locate the campus map signboard serial number near the north highway turn.', locationHint: 'Campus North Arch', answer: 'checkpoint', targetLat: 15.4320, targetLng: 75.0130, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Under the glass noticeboard frame', penaltyMins: 2 }] },
      { orderIndex: 25, title: 'Solar Grid Walkway', clueText: 'Record the photovoltaic array inverter rating on the solar display box.', locationHint: 'Staff Quarters Solar Walkway', answer: 'watt', targetLat: 15.4265, targetLng: 75.0165, triggerRadiusMeters: 25, isFinal: false, hints: [{ text: 'Digital meter box mounted on pillar', penaltyMins: 2 }] },
      { orderIndex: 26, title: 'Grand Finale Rendezvous', clueText: 'GRAND FINALE OBJECTIVE: Intercept target operative standing at the Central Amphitheatre! Capture live photo proof together and sprint to Start Venue!', locationHint: 'SDMCET Central Amphitheatre Arena', answer: '', isFinal: true, targetLat: 15.4272, targetLng: 75.0146, triggerRadiusMeters: 30, hints: [{ text: 'Target operative is holding an Anonymous Club banner at the stage center', penaltyMins: 2 }] }
    ];

    // Wipe prior levels safely
    await prisma.$transaction(async (tx) => {
      await tx.teamPath.deleteMany({});
      await tx.hintReveal.deleteMany({});
      await tx.teamLevelProgress.deleteMany({});
      await tx.teamCheckpoint.deleteMany({});
      await tx.hint.deleteMany({});
      await tx.checkpoint.deleteMany({});
      await tx.socialLink.deleteMany({});
      await tx.level.deleteMany({ where: { gameId } });

      for (const item of SDMCET_26_PACK) {
        const { hints, ...levelData } = item;
        const created = await tx.level.create({
          data: { ...levelData, gameId },
        });

        if (hints && hints.length > 0) {
          for (let i = 0; i < hints.length; i++) {
            await tx.hint.create({
              data: {
                levelId: created.id,
                orderIndex: i + 1,
                text: hints[i].text,
                penaltyMins: hints[i].penaltyMins,
              },
            });
          }
        }
      }
    });

    const generated = await prisma.level.findMany({
      where: { gameId },
      orderBy: { orderIndex: 'asc' },
      include: { hints: true },
    });

    res.json({ ok: true, count: generated.length, levels: generated });
  } catch (err: any) {
    console.error('Failed to generate 26-pack:', err);
    res.status(500).json({ error: err.message ?? 'Failed to generate 26-pack' });
  }
});

// List levels for a game
router.get('/game/:gameId', requireAuth('admin'), async (req, res) => {
  const levels = await prisma.level.findMany({
    where: { gameId: Number(req.params.gameId) },
    orderBy: { orderIndex: 'asc' },
    include: { socialLinks: true, hints: { orderBy: { orderIndex: 'asc' } }, checkpoints: true },
  });
  res.json(levels);
});

// Create level
router.post('/game/:gameId', requireAuth('admin'), async (req, res) => {
  const { hints, socialLinks, checkpoints, ...data } = req.body;
  if ('targetLat' in data) data.targetLat = data.targetLat !== '' && data.targetLat != null ? Number(data.targetLat) : null;
  if ('targetLng' in data) data.targetLng = data.targetLng !== '' && data.targetLng != null ? Number(data.targetLng) : null;
  if ('triggerRadiusMeters' in data) data.triggerRadiusMeters = data.triggerRadiusMeters != null ? Number(data.triggerRadiusMeters) : 20;
  if ('orderIndex' in data) data.orderIndex = Number(data.orderIndex);
  if ('durationSecs' in data) data.durationSecs = data.durationSecs ? Number(data.durationSecs) : null;

  const level = await prisma.level.create({
    data: { ...data, gameId: Number(req.params.gameId) },
  });

  if (Array.isArray(hints)) {
    for (let i = 0; i < hints.length; i++) {
      const h = hints[i];
      if (h && h.text && h.text.trim()) {
        await prisma.hint.create({
          data: {
            levelId: level.id,
            orderIndex: i + 1,
            text: h.text.trim(),
            penaltyMins: Number(h.penaltyMins ?? (i + 1) * 2),
          },
        });
      }
    }
  }

  const completeLevel = await prisma.level.findUnique({
    where: { id: level.id },
    include: { hints: { orderBy: { orderIndex: 'asc' } }, socialLinks: true },
  });
  res.status(201).json(completeLevel);
});

// Update level
router.put('/:id', requireAuth('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { hints, socialLinks, checkpoints, ...data } = req.body;
  if ('targetLat' in data) data.targetLat = data.targetLat !== '' && data.targetLat != null ? Number(data.targetLat) : null;
  if ('targetLng' in data) data.targetLng = data.targetLng !== '' && data.targetLng != null ? Number(data.targetLng) : null;
  if ('triggerRadiusMeters' in data) data.triggerRadiusMeters = data.triggerRadiusMeters != null ? Number(data.triggerRadiusMeters) : 20;
  if ('orderIndex' in data) data.orderIndex = Number(data.orderIndex);
  if ('durationSecs' in data) data.durationSecs = data.durationSecs ? Number(data.durationSecs) : null;

  const level = await prisma.level.update({
    where: { id },
    data,
  });

  if (Array.isArray(hints)) {
    // Delete existing hint reveals and hints
    const existingHints = await prisma.hint.findMany({ where: { levelId: id }, select: { id: true } });
    const hintIds = existingHints.map((h) => h.id);
    if (hintIds.length > 0) {
      await prisma.hintReveal.deleteMany({ where: { hintId: { in: hintIds } } });
      await prisma.hint.deleteMany({ where: { levelId: id } });
    }

    for (let i = 0; i < hints.length; i++) {
      const h = hints[i];
      if (h && h.text && h.text.trim()) {
        await prisma.hint.create({
          data: {
            levelId: id,
            orderIndex: i + 1,
            text: h.text.trim(),
            penaltyMins: Number(h.penaltyMins ?? (i + 1) * 2),
          },
        });
      }
    }
  }

  const completeLevel = await prisma.level.findUnique({
    where: { id },
    include: { hints: { orderBy: { orderIndex: 'asc' } }, socialLinks: true },
  });
  res.json(completeLevel);
});

router.patch('/:id', requireAuth('admin'), async (req, res) => {
  const data = { ...req.body };
  if ('targetLat' in data) data.targetLat = data.targetLat !== '' && data.targetLat != null ? Number(data.targetLat) : null;
  if ('targetLng' in data) data.targetLng = data.targetLng !== '' && data.targetLng != null ? Number(data.targetLng) : null;
  if ('triggerRadiusMeters' in data) data.triggerRadiusMeters = data.triggerRadiusMeters != null ? Number(data.triggerRadiusMeters) : 20;
  if ('orderIndex' in data) data.orderIndex = Number(data.orderIndex);
  if ('durationSecs' in data) data.durationSecs = data.durationSecs ? Number(data.durationSecs) : null;

  const level = await prisma.level.update({
    where: { id: Number(req.params.id) },
    data,
  });
  res.json(level);
});

// Delete level with safe relation cascading
router.delete('/:id', requireAuth('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const level = await prisma.level.findUnique({ where: { id } });
    if (!level) {
      res.status(404).json({ error: 'Level not found' });
      return;
    }

    // Cascade delete all dependent records in transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete Hint reveals for hints belonging to this level
      const hints = await tx.hint.findMany({ where: { levelId: id }, select: { id: true } });
      const hintIds = hints.map((h) => h.id);
      if (hintIds.length > 0) {
        await tx.hintReveal.deleteMany({ where: { hintId: { in: hintIds } } });
      }

      // 2. Delete Checkpoint claims for checkpoints belonging to this level
      const checkpoints = await tx.checkpoint.findMany({ where: { levelId: id }, select: { id: true } });
      const cpIds = checkpoints.map((c) => c.id);
      if (cpIds.length > 0) {
        await tx.teamCheckpoint.deleteMany({ where: { checkpointId: { in: cpIds } } });
      }

      // 3. Delete Team Level Progress and Team Paths (and any reveals attached)
      await tx.teamPath.deleteMany({ where: { levelId: id } });
      const progress = await tx.teamLevelProgress.findMany({ where: { levelId: id }, select: { id: true } });
      const progIds = progress.map((p) => p.id);
      if (progIds.length > 0) {
        await tx.hintReveal.deleteMany({ where: { progressId: { in: progIds } } });
        await tx.teamLevelProgress.deleteMany({ where: { levelId: id } });
      }

      // 4. Delete Hints, Checkpoints, and Social Links
      await tx.hint.deleteMany({ where: { levelId: id } });
      await tx.checkpoint.deleteMany({ where: { levelId: id } });
      await tx.socialLink.deleteMany({ where: { levelId: id } });

      // 5. Delete the Level itself
      await tx.level.delete({ where: { id } });

      // 6. Automatically re-index remaining levels so orderIndex is contiguous (1, 2, 3...)
      const remainingLevels = await tx.level.findMany({
        where: { gameId: level.gameId },
        orderBy: { orderIndex: 'asc' },
      });
      for (let i = 0; i < remainingLevels.length; i++) {
        if (remainingLevels[i].orderIndex !== i + 1) {
          await tx.level.update({
            where: { id: remainingLevels[i].id },
            data: { orderIndex: i + 1 },
          });
        }
      }
    });

    res.json({ ok: true, deletedLevelId: id });
  } catch (err: any) {
    console.error('Failed to delete level:', err);
    res.status(500).json({ error: err.message ?? 'Failed to delete level' });
  }
});

// Add hint
router.post('/:id/hints', requireAuth('admin'), async (req, res) => {
  const hint = await prisma.hint.create({
    data: { ...req.body, levelId: Number(req.params.id) },
  });
  res.status(201).json(hint);
});

// Update hint
router.put('/hints/:id', requireAuth('admin'), async (req, res) => {
  const hint = await prisma.hint.update({ where: { id: Number(req.params.id) }, data: req.body });
  res.json(hint);
});

// Add checkpoint
router.post('/:id/checkpoints', requireAuth('admin'), async (req, res) => {
  const cp = await prisma.checkpoint.create({
    data: { ...req.body, levelId: Number(req.params.id) },
  });
  res.status(201).json(cp);
});

export default router;
