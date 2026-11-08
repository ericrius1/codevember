"""The shaman of 09 / Membrane: a tall, strong woman of no Earth people, 1.76 m, athletic from a life of drumming:
deep indigo-violet skin (the glowing sacred-geometry lines over it are the shader's, 09/shaman.wgsl), gently pointed
ears, gold eyes, long dark locks down her back (the rope locks and the filament headdress over them ride the rig at
run time, 09/locks.ts). Ceremonial dress, head to foot: a high-necked tunic of woven bark fibre, its sleeves to the
forearm (her forearms bare for the drum) banded at the cuffs, the collar and the hem; a long skirt of dark green fibre
over it from the waist, slit up both sides so she can step wide into a stroke; a wide knotted sash over the join. The
mantle of beetle-wing scales over her shoulders, the skirt's layered scales, the seed-pod rattles and vines are laid
on at run time, riding the same bones (09/regalia.ts). Barefoot.

Built with Boulder's town pipeline (Katara's base: a young woman's body, skeleton, face rig, hands, weights,
garment fitting and DNC1 export), from this spec (Lyra's frame, made stronger):

  zsh 09/character/build.sh        # Blender, then the finish: 09/assets/shaman_{hi,lo}.bin.gz
"""
import math
import numpy as np

HEIGHT = 1.76
HEAD = 0.95
MALE = False
# (linear) deep indigo-violet skin, near-black hair with a blue cast, gold eyes, dark plum lips
TONES = dict(skin=(0.16, 0.1, 0.34), hair=(0.03, 0.026, 0.035), iris=(0.85, 0.55, 0.12), lips=(0.13, 0.05, 0.17))

# (Katara's torso and skeleton; a drummer's arms and shoulders a little fuller)
ARM_K = (1.07, 1.04)
LEG_K = (1.03, 1.01)
RATIOS = [('_tunic', 0.36, 0.1), ('_skirt', 0.4, 0.14), ('_belt', None, 0.4), ('_groom_hair', 0.26, 0.1),
          ('_ring', None, 0.5), ('_body', 0.12, 0.04)]
KNEE_CUT = None
BARE_FEET = True
FEET_KEEP = 0.12


def SHAPE(sc, s):
    """after Katara's shape pass: shoulders and upper arms a touch fuller (deltoids), her toes parted (lyra.py's)"""
    import lyra
    S = lambda *p: np.array(p) * s
    for side in (1, -1):
        sc.inflate(S(side * 0.17, 1.33, -0.005), (0.035 * s, 0.045 * s, 0.04 * s), 0.0025 * s)
    sc.smooth(1, 0.25)
    lyra.SHAPE(sc, s)


def FACE(sc, S, w):
    """high strong cheekbones, a straight nose, full lips, a firm chin"""
    E = S['eye']
    ny, nz = S['nose_tip']
    my = S['mouth_y']
    for side in (1, -1):
        sc.inflate(np.array([side * 0.044, E['y'] - 0.018, nz - 0.04]), (0.019, 0.012, 0.016), 0.0018, mask=w)
        sc.inflate(np.array([side * 0.008, my - 0.005, nz - 0.012]), (0.012, 0.005, 0.008), 0.0008, mask=w)
    sc.inflate(np.array([0.0, S['chin'][0] + 0.004, S['chin'][1] - 0.004]), (0.014, 0.009, 0.01), 0.0012, mask=w)
    sc.smooth(1, 0.25, mask=w)


# ------------------------------------------------------------------ what she wears (linear colours)
FIBRE = (0.05, 0.075, 0.03)      # dark green plant fibre (the skirt; the shader lays the beetle-wing scales over it)
TUNIC = (0.15, 0.1, 0.045)       # the tunic: woven bark fibre (the shader weaves its gold geometry into it)
BAND = (0.55, 0.36, 0.1)         # its bands: gold thread
SASH = (0.09, 0.05, 0.11)        # a deep plum sash
GOLD = (0.78, 0.53, 0.2)
SKIN = TONES['skin']


def wardrobe(TG, GR):
    import lyra

    def skirt(fit, col):
        return TG.skirt(fit, col, slits=False, pleats=13, amp=0.1)

    def tunic(fit, col):
        # (high at the neck, its sleeves to the forearm, its hem tucked under the skirt; banded at the collar, the cuffs
        # and the hem)
        return TG.shirt(fit, col, name='tunic', neck=1.43, dip=0.012, hem=0.93, sleeve=0.66, ease=0.011, loose=0.026,
                        cuff=(0.009, 0.034, 'band'), collar=(0.008, 0.02, 'band'), hem_band=(0.006, 0.03, 'band'), decimate=0.2)

    def sash(fit, col):
        return TG.belt(fit, col, y=0.985, h=0.07, ease=0.02, buckle=False)

    def ears(fit, col):
        return lyra.elf_ears(TG, fit, col, tip=0.028, tip_ang=55.0)

    def hair(fit, col):
        return lyra.groom(TG, GR, fit, col, volume=0.016, end_y=0.98, n_locks=26, wave=0.003, wavelength=0.1, seed=9, front=3, braids=True)

    # (built in this order: the tunic, the skirt over its hem, the sash over the join, the ears, the hair)
    W = {
        'top': {'tunic': ('Ceremonial tunic', tunic, {'main': (TUNIC, 0.9, 0.3, 0, 0), 'band': (BAND, 0.6, 0.5, 0, 0)})},
        'bottom': {'fibre': ('Fibre and beetle-wing skirt', skirt, {'main': (FIBRE, 0.85, 0.35, 0, 0)})},
        'waist': {'sash': ('Plum sash', sash, {'main': (SASH, 0.85, 0.3, 0, 0)})},
        'accessory': {'ears': ('Ears', ears, {'main': (SKIN, 0.55, 0.1, 0, 0)})},
        'groom': {'locks': ('Long dark locks', hair, {'main': (TONES['hair'], 0.9, 0.2, 0, 0)})},
    }
    outfit = {'top': 'tunic', 'bottom': 'fibre', 'waist': 'sash', 'accessory': 'ears', 'groom': 'locks'}
    # role -> palette slot (mc_export.PAL): the tunic 'top' (1), its bands 'trim' (5), the skirt 'bottom' (2), the locks 'hair' (3), the sash
    # 'sash' (7), the ears 'ribbon' (6: skin)
    roles = {
        'bottom': {'main': 'bottom'},
        'top': {'main': 'top', 'band': 'trim'},
        'waist': {'main': 'sash'},
        'accessory': {'main': 'ribbon'},
        'groom': {'main': 'hair'},
    }
    # the skirt: Katara's panel skirt (hero_garments.PANEL) hung from the hips to the ankles, slit to mid-thigh, its
    # front and back panels on physics chains (panelF / panelB, run by the rig)
    panel = dict(y_top=1.0, y_hem=0.05, y_slit=0.72, flare=0.3, ease_top=0.022, ease_hem=0.05, follow=0.75)
    return {'wardrobe': W, 'outfit': outfit, 'roles': roles, 'props': {}, 'panel': panel}
