import React, { useRef } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Svg, { Path, Rect, Circle, Text as SvgText, Line, G } from 'react-native-svg';
import { DEPT_FLOORS, DEPT_FLOOR_LABELS, FALLBACK_LECTURE_SLOTS } from '../../constants/config';
import { SS } from '../../constants/colors';
import { toMin, getFullRoomStatus } from '../../utils/helpers';

function polar(cx, cy, r, deg) {
  const rad = deg * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function labelLines(room) {
  const label = room.label || room.id;
  if (label.length <= 17) return [label];
  const words = label.split(' ');
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
}

function RoomBlock({ room, dark, timetable, now, arrangedClasses, cancelledSlots, lectureSlots, mode, onPress, issueReported, focusedRoomId }) {
  const isLT  = room.type === 'lt';
  const isLab = room.type === 'lab';

  let c, status = 'free', isMine = false, isArr = false;

  if (isLT || isLab) {
    if (mode === 'holiday') {
      status = 'holiday';
      c = SS.holiday[dark ? 'd' : 'l'];
    } else {
    const rs = getFullRoomStatus(room.id, now, timetable, arrangedClasses, cancelledSlots, lectureSlots);
    status = rs.status;
    c = SS[status][dark ? 'd' : 'l'];
    isMine = status === 'mine';
    isArr  = status === 'arranged';
    }
  } else {
    c = dark
      ? { bg: '#1E1E30', bd: '#334155', tx: '#94A3B8' }
      : { bg: '#F8F9FA', bd: '#CBD5E1', tx: '#64748B' };
  }

  const x = room.cx - room.w / 2;
  const y = room.cy - room.h / 2;
  const isOffice = room.type === 'office' && !/(lab|conference|common room)/i.test(`${room.id} ${room.label || ''}`);
  const focused = room.id === focusedRoomId;
  const clickable = isLT || isLab || isOffice;
  const hasBar = isMine || isArr;

  return (
    <G
      onPress={clickable ? () => onPress({ roomId: room.id, room }) : undefined}
      accessibilityRole={clickable ? 'button' : undefined}
    >
      {isMine && (
        <Rect x={x-3} y={y-3} width={room.w+6} height={room.h+6} rx={9}
          fill="#EF4444" opacity={0.15} />
      )}
      <Rect x={x} y={y} width={room.w} height={room.h} rx={5}
        fill={c.bg} stroke={focused ? '#F59E0B' : c.bd} strokeWidth={focused ? 3 : hasBar ? 2 : 1} />
      {hasBar && (
        <Rect x={x} y={y} width={room.w} height={3} rx={2} fill={c.bd} />
      )}
      {issueReported && (
        <>
          <Circle cx={x + room.w - 7} cy={y + 7} r={6}
            fill={issueReported === 'completed' ? '#16A34A' : '#2563EB'}
            stroke="#FFFFFF" strokeWidth={1.5} />
          <SvgText x={x + room.w - 7} y={y + 10} textAnchor="middle"
            fontSize={8} fontWeight="900" fill="#FFFFFF">!</SvgText>
        </>
      )}
      {isLT && <>
        <SvgText x={room.cx} y={room.cy - 1} textAnchor="middle"
          fontSize={room.w > 100 ? 9 : 8} fontWeight="700" fill={c.tx}>
          {labelLines(room)[0]}
        </SvgText>
        {labelLines(room)[1] && (
          <SvgText x={room.cx} y={room.cy + 9} textAnchor="middle"
            fontSize={room.w > 100 ? 8 : 7} fontWeight="700" fill={c.tx}>
            {labelLines(room)[1]}
          </SvgText>
        )}
        <Circle cx={room.cx} cy={room.cy + (labelLines(room)[1] ? 15 : 10)} r={3.5} fill={c.dt || c.bd} opacity={0.9} />
        {isArr && (
          <SvgText x={room.cx} y={room.cy + 20} textAnchor="middle" fontSize={5.5} fontWeight="700" fill={c.tx}>
            Arranged
          </SvgText>
        )}
      </>}
      {isLab && <>
        <SvgText x={room.cx} y={room.cy - (labelLines(room)[1] ? 5 : 1)} textAnchor="middle"
          fontSize={room.w > 130 ? 10 : 9} fontWeight="700" fill={c.tx}>
          {labelLines(room)[0]}
        </SvgText>
        {labelLines(room)[1] && (
          <SvgText x={room.cx} y={room.cy + 5} textAnchor="middle"
            fontSize={room.w > 130 ? 10 : 9} fontWeight="700" fill={c.tx}>
            {labelLines(room)[1]}
          </SvgText>
        )}
      </>}
      {!isLT && !isLab && (
        <SvgText x={room.cx} y={room.cy + (labelLines(room)[1] ? -2 : 4)} textAnchor="middle" fontSize={6} fill={c.tx}>
          {labelLines(room)[0]}
        </SvgText>
      )}
      {!isLT && !isLab && labelLines(room)[1] && (
        <SvgText x={room.cx} y={room.cy + 7} textAnchor="middle" fontSize={6} fill={c.tx}>
          {labelLines(room)[1]}
        </SvgText>
      )}
    </G>
  );
}

function CourtyardMap({ floorData, floor, dark, timetable, now, arrangedClasses, cancelledSlots, lectureSlots, mode, onRoomPress, reportedIssues, focusedRoomId }) {
  const { building, courtyard, rooms, entrance, label } = floorData;
  const lc = dark ? '#9B7EF8' : '#3D2B8E';
  const { width: screenWidth } = useWindowDimensions();
  const svgWidth = 646;
  const svgHeight = 255;
  const scrollRef = useRef(null);

  React.useEffect(() => {
    const viewportWidth = Math.max(screenWidth - 30, 0);
    const centeredOffset = Math.max((svgWidth - viewportWidth) / 2, 0);
    const timer = setTimeout(() => {
      const targetRoom = (floorData.rooms || []).find(room => room.id === focusedRoomId);
      const targetOffset = targetRoom ? (targetRoom.cx / 760) * svgWidth - viewportWidth / 2 : centeredOffset;
      scrollRef.current?.scrollTo({ x: Math.max(0, Math.min(svgWidth - viewportWidth, targetOffset)), animated: !!targetRoom });
    }, 50);
    return () => clearTimeout(timer);
  }, [floor, floorData, screenWidth, svgWidth, focusedRoomId]);

  return (
    <View>
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator style={{ flexGrow: 0 }}>
      <Svg width={svgWidth} height={svgHeight} viewBox="0 200 760 300">
        <Rect x={building.x} y={building.y} width={building.w} height={building.h}
          fill={dark ? '#17172E' : '#F7F5EA'} stroke={dark ? '#3D2B8E' : '#8D835C'} strokeWidth={2} />
        <Rect x={courtyard.x} y={courtyard.y} width={courtyard.w} height={courtyard.h}
          fill={dark ? '#0E1720' : '#FEFEFA'} stroke={dark ? '#64748B' : '#8D835C'} strokeWidth={2} />
        <SvgText x={courtyard.x + courtyard.w / 2} y={courtyard.y + courtyard.h / 2 + 5}
          textAnchor="middle" fontSize={11} fill={dark ? '#CBD5E1' : '#554D3A'} fontWeight="700" letterSpacing={1}>
          {label || `Floor ${floor}`}
        </SvgText>

        {rooms.map(room => (
          <RoomBlock key={room.id} room={room} dark={dark}
            timetable={timetable} now={now}
            arrangedClasses={arrangedClasses}
            cancelledSlots={cancelledSlots}
            lectureSlots={lectureSlots}
            mode={mode}
            onPress={onRoomPress}
            issueReported={reportedIssues?.[room.id]} focusedRoomId={focusedRoomId} />
        ))}

        {entrance && <>
          <Rect x={entrance.x} y={entrance.y} width={entrance.w} height={entrance.h}
            fill={dark ? '#20203B' : '#E9E5D4'} stroke={dark ? '#64748B' : '#554D3A'} strokeWidth={1.5} />
          <SvgText x={entrance.x + entrance.w / 2} y={entrance.y + 16}
            textAnchor="middle" fontSize={7} fill={lc} fontWeight="700">
            ENTRANCE
          </SvgText>
        </>}
      </Svg>
      </ScrollView>
    </View>
  );
}

export default function ArcMap({ floor, dark, timetable, now, arrangedClasses, cancelledSlots, lectureSlots, mode, onRoomPress, reportedIssues, department = 'cs', focusedRoomId = null }) {
  const deptFloors = DEPT_FLOORS[department] || DEPT_FLOORS.cs;
  const fd = deptFloors[floor];
  const { width: mapScreenWidth } = useWindowDimensions();
  const scrollRef = useRef(null);
  React.useEffect(() => {
    if (!fd || fd.layout === 'courtyard') return;
    const rooms = [...(fd.arcRooms || []), ...(fd.leftWing || []), ...(fd.rightWing || [])];
    const target = rooms.find(room => room.id === focusedRoomId);
    const viewportWidth = Math.max(mapScreenWidth - 30, 0);
    const timer = setTimeout(() => {
      const x = target ? target.cx - viewportWidth / 2 : 380 - 180;
      scrollRef.current?.scrollTo({ x: Math.max(0, Math.min(760 - viewportWidth, x)), animated: !!target });
    }, 50);
    return () => clearTimeout(timer);
  }, [fd, floor, focusedRoomId, mapScreenWidth]);
  if (!fd) return null;

  if (fd.layout === 'courtyard') {
    return (
      <CourtyardMap floorData={fd} floor={floor} dark={dark}
        timetable={timetable} now={now}
        arrangedClasses={arrangedClasses}
        cancelledSlots={cancelledSlots}
        lectureSlots={lectureSlots}
        mode={mode}
        onRoomPress={onRoomPress}
        reportedIssues={reportedIssues} focusedRoomId={focusedRoomId} />
    );
  }

  const { arcRooms, outerR, innerR } = fd;
  const leftWing  = fd.leftWing  || [];
  const rightWing = fd.rightWing || [];
  const ACX = 380, ACY = 460;
  const lc  = dark ? '#9B7EF8' : '#3D2B8E';

  const span = 64, sA = 270 - span / 2, eA = 270 + span / 2;
  const p = (r, deg) => polar(ACX, ACY, r, deg);
  const oS = p(outerR,sA), oE = p(outerR,eA);
  const iS = p(innerR,sA), iE = p(innerR,eA);
  const band = `M${oS.x} ${oS.y} A${outerR} ${outerR} 0 0 1 ${oE.x} ${oE.y} L${iE.x} ${iE.y} A${innerR} ${innerR} 0 0 0 ${iS.x} ${iS.y} Z`;
  const cO = innerR + 12;
  const coS = p(cO,sA), coE = p(cO,eA), ciS = p(cO,sA), ciE = p(cO,eA);
  // corridor arc
  const corrInner = innerR;
  const corrOuter = innerR + 12;
  const corrOS = p(corrOuter,sA), corrOE = p(corrOuter,eA);
  const corrIS = p(corrInner,sA), corrIE = p(corrInner,eA);
  const corr = `M${corrOS.x} ${corrOS.y} A${corrOuter} ${corrOuter} 0 0 1 ${corrOE.x} ${corrOE.y} L${corrIE.x} ${corrIE.y} A${corrInner} ${corrInner} 0 0 0 ${corrIS.x} ${corrIS.y} Z`;

  const arcBaseL = p(innerR + 2, sA);
  const arcBaseR = p(innerR + 2, eA);
  const fwL = leftWing[0], fwR = rightWing[0];

  const VB_X = 0, VB_Y = 220, VB_W = 760, VB_H = 220;
  const SVG_W = 760;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
    >
      <Svg width={SVG_W} height={VB_H} viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}>
        <Path d={band}
          fill={dark ? '#1A1A3E' : '#EEF0FF'}
          stroke={dark ? '#3D2B8E' : '#B8B0E8'}
          strokeWidth={1.5} />
        <Path d={corr}
          fill={dark ? '#0F0F2A' : '#D5D0F0'}
          stroke={dark ? '#3D2B8E' : '#B8B0E8'}
          strokeWidth={1} />
        <SvgText x={ACX} y={ACY - innerR - 8} textAnchor="middle"
          fontSize={7} fill={lc} fontWeight="700" letterSpacing={2}>
          CORRIDOR
        </SvgText>

        {arcRooms.map(r => (
          <RoomBlock key={r.id} room={r} dark={dark}
            timetable={timetable} now={now}
            arrangedClasses={arrangedClasses}
            cancelledSlots={cancelledSlots}
            lectureSlots={lectureSlots}
            mode={mode}
            onPress={onRoomPress}
            issueReported={reportedIssues?.[r.id]} focusedRoomId={focusedRoomId} />
        ))}

        {fwL && (
          <Line x1={arcBaseL.x} y1={arcBaseL.y}
            x2={fwL.cx + fwL.w / 2} y2={arcBaseL.y}
            stroke={dark ? '#2A1C6B' : '#CBD5E1'} strokeWidth={1} />
        )}
        {fwR && (
          <Line x1={arcBaseR.x} y1={arcBaseR.y}
            x2={fwR.cx - fwR.w / 2} y2={arcBaseR.y}
            stroke={dark ? '#2A1C6B' : '#CBD5E1'} strokeWidth={1} />
        )}

        {leftWing.map(r => (
          <RoomBlock key={r.id} room={r} dark={dark}
            timetable={timetable} now={now}
            arrangedClasses={arrangedClasses}
            cancelledSlots={cancelledSlots}
            lectureSlots={lectureSlots}
            mode={mode}
            onPress={onRoomPress}
            issueReported={reportedIssues?.[r.id]} focusedRoomId={focusedRoomId} />
        ))}
        {rightWing.map(r => (
          <RoomBlock key={r.id} room={r} dark={dark}
            timetable={timetable} now={now}
            arrangedClasses={arrangedClasses}
            cancelledSlots={cancelledSlots}
            lectureSlots={lectureSlots}
            mode={mode}
            onPress={onRoomPress}
            issueReported={reportedIssues?.[r.id]} focusedRoomId={focusedRoomId} />
        ))}

        <SvgText x={ACX} y={VB_Y + 14} textAnchor="middle"
          fontSize={9} fill={lc} fontWeight="700" letterSpacing={1.5}>
          {DEPT_FLOOR_LABELS[department]?.[floor] || `Floor ${floor}`}
        </SvgText>
      </Svg>
    </ScrollView>
  );
}
